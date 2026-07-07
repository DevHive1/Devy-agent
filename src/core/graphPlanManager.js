'use strict';
const fs = require('fs');
const path = require('path');
const { colors, ICONS } = require('../ui/theme');
const { getWidth } = require('../ui/layout');

class GraphPlanManager {
  constructor({ planDir }) {
    this.planDir = planDir;
    fs.mkdirSync(planDir, { recursive: true });
    this.activePlanId = null;
  }

  createPlan({ title, description, tasks = [], dependencies = [] }) {
    const id = 'gplan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    
    // Construct Nodes
    const nodes = {};
    tasks.forEach(t => {
      const taskId = typeof t === 'string' ? t.toLowerCase().replace(/[^a-z0-9]/g, '-') : t.id;
      nodes[taskId] = {
        id: taskId,
        title: typeof t === 'string' ? t : t.title,
        status: 'pending',
        duration: typeof t === 'object' ? (t.duration || 1) : 1,
        note: typeof t === 'object' ? (t.note || '') : ''
      };
    });

    // Construct Edges and validate no cycles
    const edges = [];
    dependencies.forEach(d => {
      if (!nodes[d.from] || !nodes[d.to]) {
        throw new Error(`Invalid dependency: edge from "${d.from}" to "${d.to}" has missing nodes.`);
      }
      edges.push({ from: d.from, to: d.to });
    });

    const plan = {
      id, title, description,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes,
      edges
    };

    // Recalculate node states (blocked vs ready)
    this._recalculateNodeStatuses(plan);

    // Validate cycle check
    try {
      this.topologicalSort(plan);
    } catch (e) {
      throw new Error(`Cycle detected in plan dependencies: ${e.message}`);
    }

    this._save(id, plan);
    this.activePlanId = id;
    return plan;
  }

  getPlan(id) {
    const planId = id || this.activePlanId;
    if (!planId) return null;
    const file = path.join(this.planDir, `${planId}.json`);
    try {
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    } catch (_) {
      return null;
    }
  }

  listPlans() {
    try {
      return fs.readdirSync(this.planDir).filter(f => f.startsWith('gplan-') && f.endsWith('.json')).map(f => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(this.planDir, f), 'utf8'));
          return {
            id: d.id,
            title: d.title,
            status: d.status,
            createdAt: d.createdAt,
            nodeCount: Object.keys(d.nodes || {}).length
          };
        } catch (_) {
          return null;
        }
      }).filter(Boolean).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (_) {
      return [];
    }
  }

  updateTaskStatus(planId, taskId, status, note) {
    const plan = this.getPlan(planId);
    if (!plan) return { error: 'Plan not found' };
    if (!plan.nodes[taskId]) return { error: `Task "${taskId}" not found` };

    const task = plan.nodes[taskId];
    task.status = status;
    if (note !== undefined) task.note = note;

    this._recalculateNodeStatuses(plan);

    plan.updatedAt = new Date().toISOString();
    
    // Check overall plan completion
    const allNodes = Object.values(plan.nodes);
    const allDone = allNodes.every(n => n.status === 'done');
    const anyFailed = allNodes.some(n => n.status === 'failed');

    if (allDone) plan.status = 'done';
    else if (anyFailed) plan.status = 'failed';
    else plan.status = 'active';

    this._save(plan.id, plan);
    return { success: true, plan };
  }

  _recalculateNodeStatuses(plan) {
    const topoOrder = this.topologicalSort(plan);
    
    // For each node in topological order
    for (const nodeId of topoOrder) {
      const node = plan.nodes[nodeId];
      if (node.status === 'done' || node.status === 'failed' || node.status === 'in_progress') {
        continue;
      }

      // Find incoming dependencies
      const incoming = plan.edges.filter(e => e.to === nodeId).map(e => plan.nodes[e.from]);
      
      if (incoming.length === 0) {
        // No dependencies -> ready to start
        if (node.status === 'blocked' || node.status === 'pending') {
          node.status = 'ready';
        }
      } else {
        const allDone = incoming.every(dep => dep.status === 'done');
        const anyFailed = incoming.some(dep => dep.status === 'failed');
        
        if (anyFailed) {
          node.status = 'blocked';
          node.note = 'Blocked by failed dependency';
        } else if (allDone) {
          if (node.status === 'blocked' || node.status === 'pending') {
            node.status = 'ready';
          }
        } else {
          node.status = 'blocked';
        }
      }
    }
  }

  topologicalSort(plan) {
    const nodes = Object.keys(plan.nodes);
    const inDegree = {};
    const adj = {};

    nodes.forEach(n => {
      inDegree[n] = 0;
      adj[n] = [];
    });

    plan.edges.forEach(e => {
      adj[e.from].push(e.to);
      inDegree[e.to]++;
    });

    const queue = [];
    nodes.forEach(n => {
      if (inDegree[n] === 0) queue.push(n);
    });

    const topoOrder = [];
    while (queue.length > 0) {
      const u = queue.shift();
      topoOrder.push(u);

      adj[u].forEach(v => {
        inDegree[v]--;
        if (inDegree[v] === 0) queue.push(v);
      });
    }

    if (topoOrder.length !== nodes.length) {
      throw new Error('Graph has cycles');
    }

    return topoOrder;
  }

  calculateCriticalPath(plan) {
    const topo = this.topologicalSort(plan);
    const ES = {}; // Earliest Start
    const EF = {}; // Earliest Finish
    
    // Initialize
    topo.forEach(id => {
      ES[id] = 0;
      EF[id] = plan.nodes[id].duration;
    });

    // Forward pass
    topo.forEach(u => {
      const uEF = EF[u];
      const outgoing = plan.edges.filter(e => e.from === u);
      outgoing.forEach(e => {
        const v = e.to;
        if (uEF > ES[v]) {
          ES[v] = uEF;
          EF[v] = ES[v] + plan.nodes[v].duration;
        }
      });
    });

    // Find project duration
    const projectDuration = Math.max(...Object.values(EF), 0);

    // Backward pass
    const LS = {}; // Latest Start
    const LF = {}; // Latest Finish
    
    // Initialize latest times with project duration
    topo.forEach(id => {
      LF[id] = projectDuration;
      LS[id] = projectDuration - plan.nodes[id].duration;
    });

    const reverseTopo = [...topo].reverse();
    reverseTopo.forEach(v => {
      const vLS = LS[v];
      const incoming = plan.edges.filter(e => e.to === v);
      incoming.forEach(e => {
        const u = e.from;
        if (vLS < LF[u]) {
          LF[u] = vLS;
          LS[u] = LF[u] - plan.nodes[u].duration;
        }
      });
    });

    // Nodes on Critical Path have slack (float) = LF - EF = LS - ES = 0
    const criticalNodes = topo.filter(id => {
      const slack = LF[id] - EF[id];
      return slack === 0;
    });

    return {
      path: criticalNodes,
      duration: projectDuration
    };
  }

  renderGraphASCII(plan) {
    // Generate horizontal layout of dependency layers
    const topo = this.topologicalSort(plan);
    const layers = [];
    const nodeLayerMap = {};

    // Assign layers by longest path from source
    topo.forEach(nodeId => {
      const incoming = plan.edges.filter(e => e.to === nodeId);
      if (incoming.length === 0) {
        nodeLayerMap[nodeId] = 0;
      } else {
        const maxPrevLayer = Math.max(...incoming.map(e => nodeLayerMap[e.from]));
        nodeLayerMap[nodeId] = maxPrevLayer + 1;
      }
      const layerIdx = nodeLayerMap[nodeId];
      if (!layers[layerIdx]) layers[layerIdx] = [];
      layers[layerIdx].push(nodeId);
    });

    // Render layers
    const lines = [];
    layers.forEach((layer, lIdx) => {
      const nodeBoxes = layer.map(nodeId => {
        const node = plan.nodes[nodeId];
        let statusColor = colors.textMuted;
        let icon = ICONS.pending;

        if (node.status === 'done') {
          statusColor = colors.success;
          icon = ICONS.success;
        } else if (node.status === 'in_progress') {
          statusColor = colors.warning;
          icon = ICONS.running;
        } else if (node.status === 'ready') {
          statusColor = colors.cyan;
          icon = ICONS.execute;
        } else if (node.status === 'failed') {
          statusColor = colors.error;
          icon = ICONS.failed;
        }

        return statusColor(`[${nodeId}] ${node.title} (${icon})`);
      });

      lines.push(`  Layer ${lIdx + 1}: ${nodeBoxes.join('  |  ')}`);
      
      // Draw connection lines to next layer
      if (lIdx < layers.length - 1) {
        lines.push(`           │`);
        lines.push(`           ▼`);
      }
    });

    return lines.join('\n');
  }

  renderSummary(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return 'No active plan.';

    const width = Math.min(getWidth(), 80);
    const contentWidth = width - 6;
    const pipe = colors.brand(ICONS.pipe);

    const cp = this.calculateCriticalPath(plan);

    const lines = [];
    lines.push(colors.brand('╭─ ' + ICONS.plan + '  ' + colors.bold('Graph Plan: ' + plan.title) + ' ' + '─'.repeat(Math.max(4, contentWidth - plan.title.length - 17)) + '╮'));
    if (plan.description) {
      lines.push(`  ${pipe}  ${colors.textDim(plan.description)}${' '.repeat(Math.max(0, contentWidth - plan.description.length - 4))}  ${pipe}`);
      lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);
    }

    // Critical path row
    const cpStr = cp.path.map(id => colors.bold.error(id)).join(colors.textMuted(' → '));
    const cpLine = `  ${colors.bold.brand('Critical Path:')} ${cpStr} ${colors.textDim(`(Est. Duration: ${cp.duration}h)`)}`;
    lines.push(`  ${pipe} ${cpLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(cpLine).length - 1))} ${pipe}`);
    lines.push(`  ${pipe} ${colors.border('─'.repeat(contentWidth - 2))} ${pipe}`);

    // Nodes and status
    const topo = this.topologicalSort(plan);
    topo.forEach(id => {
      const node = plan.nodes[id];
      let icon = ICONS.pending;
      let statusColor = colors.textMuted;

      if (node.status === 'done') {
        icon = ICONS.success;
        statusColor = colors.success;
      } else if (node.status === 'in_progress') {
        icon = ICONS.running;
        statusColor = colors.warning;
      } else if (node.status === 'ready') {
        icon = ICONS.execute;
        statusColor = colors.cyan;
      } else if (node.status === 'failed') {
        icon = ICONS.failed;
        statusColor = colors.error;
      }

      const dependencies = plan.edges.filter(e => e.to === id).map(e => e.from).join(', ') || 'None';
      const nodeLine = `  ${statusColor(icon)} [${colors.bold(id)}] ${colors.text(node.title)} ${colors.textDim(`(Needs: ${dependencies})`)}`;
      lines.push(`  ${pipe} ${nodeLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(nodeLine).length - 1))} ${pipe}`);
    });

    lines.push(`  ${pipe} ${colors.border('─'.repeat(contentWidth - 2))} ${pipe}`);
    
    // ASCII Drawing section
    lines.push(`  ${pipe}  ${colors.bold.cyan('Dependency Visualization:')}${' '.repeat(contentWidth - 28)} ${pipe}`);
    const ascii = this.renderGraphASCII(plan);
    ascii.split('\n').forEach(line => {
      lines.push(`  ${pipe} ${line}${' '.repeat(Math.max(0, contentWidth - stripAnsi(line).length - 1))} ${pipe}`);
    });

    lines.push(colors.brand('╰' + '─'.repeat(contentWidth) + '╯'));
    return lines.join('\n');
  }

  compactStatusLine(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return '';
    const nodes = Object.values(plan.nodes);
    const total = nodes.length;
    const done = nodes.filter(n => n.status === 'done').length;
    const cp = this.calculateCriticalPath(plan);
    return `[Graph Plan: ${plan.title}] ${done}/${total} tasks done. Critical Path: ${cp.path.join('->')} (${cp.duration}h)`;
  }

  _save(id, data) {
    fs.writeFileSync(path.join(this.planDir, `${id}.json`), JSON.stringify(data, null, 2), 'utf8');
  }
}

function buildGraphPlanManagerTools(manager) {
  return {
    create_graph_plan: {
      description: 'Create a Directed Acyclic Graph (DAG) plan of tasks and dependencies. Calculates critical paths and slack times to enable parallel subagent execution.',
      params: {
        title: 'string (required)',
        description: 'string (optional)',
        tasks: 'array of objects (required: [{id: string, title: string, duration: number (optional, defaults to 1), note: string (optional)}])',
        dependencies: 'array of objects (required: [{from: string, to: string}])'
      },
      handler: async ({ title, description, tasks, dependencies }) => {
        if (!title) return { error: 'Missing parameter: "title"' };
        if (!tasks || !Array.isArray(tasks)) return { error: 'Missing parameter: "tasks"' };
        if (!dependencies || !Array.isArray(dependencies)) return { error: 'Missing parameter: "dependencies"' };
        try {
          const plan = manager.createPlan({ title, description, tasks, dependencies });
          return { plan, summary: manager.renderSummary(plan.id) };
        } catch (e) {
          return { error: e.message };
        }
      }
    },
    update_graph_task: {
      description: 'Update the status of a specific task in the graph plan. Status must be one of: pending, ready, in_progress, done, failed.',
      params: {
        plan_id: 'string (optional, defaults to active plan)',
        task_id: 'string (required)',
        status: 'string (required: pending/ready/in_progress/done/failed)',
        note: 'string (optional)'
      },
      handler: async ({ plan_id, task_id, status, note }) => {
        if (!task_id) return { error: 'Missing parameter: "task_id"' };
        if (!status) return { error: 'Missing parameter: "status"' };
        const id = plan_id || manager.activePlanId;
        if (!id) return { error: 'No active graph plan.' };
        try {
          return manager.updateTaskStatus(id, task_id, status, note);
        } catch (e) {
          return { error: e.message };
        }
      }
    },
    get_graph_plan: {
      description: 'Retrieve the active graph plan, including its critical path, dependency graph, and task details.',
      params: { plan_id: 'string (optional, defaults to active plan)' },
      handler: async ({ plan_id }) => {
        const id = plan_id || manager.activePlanId;
        if (!id) return { error: 'No active graph plan.' };
        const plan = manager.getPlan(id);
        if (!plan) return { error: `Plan "${id}" not found.` };
        return { plan, summary: manager.renderSummary(id) };
      }
    },
    list_graph_plans: {
      description: 'List all available graph plans.',
      params: {},
      handler: async () => {
        return { plans: manager.listPlans() };
      }
    }
  };
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = {
  GraphPlanManager,
  buildGraphPlanManagerTools
};
