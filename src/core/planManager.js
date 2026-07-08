'use strict';
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class PlanManager {
  constructor({ planDir }) {
    this.planDir = planDir;
    fs.mkdirSync(planDir, { recursive: true });
    this.activePlanId = null;
  }

  createPlan({ title, description, phases = [], priority = 'medium', tags = [] }) {
    const id = 'plan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const plan = {
      id, title, description, priority, tags, status: 'active',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      phases: phases.map((ph, i) => ({
        id: `phase-${i + 1}`, name: typeof ph === 'string' ? ph : ph.name,
        description: typeof ph === 'string' ? '' : (ph.description || ''),
        status: 'pending', tasks: (typeof ph === 'object' && ph.tasks) ? ph.tasks.map((t, j) => ({
          id: `${i + 1}.${j + 1}`, name: typeof t === 'string' ? t : t.name,
          status: 'pending', notes: ''
        })) : []
      })),
      milestones: [], notes: ''
    };
    this._save(id, plan);
    this.activePlanId = id;
    return plan;
  }

  getPlan(id) {
    const planId = id || this.activePlanId;
    if (!planId) return null;
    const file = path.join(this.planDir, `${planId}.json`);
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch (_) { return null; }
  }

  listPlans() {
    try {
      return fs.readdirSync(this.planDir).filter(f => f.startsWith('plan-') && f.endsWith('.json')).map(f => {
        try { const d = JSON.parse(fs.readFileSync(path.join(this.planDir, f), 'utf8')); return { id: d.id, title: d.title, status: d.status, createdAt: d.createdAt, phases: d.phases?.length || 0 }; } catch (_) { return null; }
      }).filter(Boolean).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (_) { return []; }
  }

  updatePhaseStatus(planId, phaseId, status) {
    const plan = this.getPlan(planId);
    if (!plan) return { error: 'Plan not found' };
    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase) return { error: `Phase "${phaseId}" not found` };
    phase.status = status;
    plan.updatedAt = new Date().toISOString();
    this._save(plan.id, plan);
    return { success: true };
  }

  updateTaskStatus(planId, taskId, status, notes) {
    const plan = this.getPlan(planId);
    if (!plan) return { error: 'Plan not found' };
    for (const phase of plan.phases) {
      const task = phase.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        if (notes) task.notes = notes;
        const allDone = phase.tasks.every(t => t.status === 'done');
        if (allDone) phase.status = 'done';
        else if (phase.tasks.some(t => t.status === 'in-progress' || t.status === 'done')) phase.status = 'in-progress';
        plan.updatedAt = new Date().toISOString();
        this._save(plan.id, plan);
        return { success: true };
      }
    }
    return { error: `Task "${taskId}" not found` };
  }

  addPhase(planId, phaseName, tasks = []) {
    const plan = this.getPlan(planId);
    if (!plan) return { error: 'Plan not found' };
    const phaseNum = plan.phases.length + 1;
    plan.phases.push({
      id: `phase-${phaseNum}`, name: phaseName, description: '', status: 'pending',
      tasks: tasks.map((t, j) => ({ id: `${phaseNum}.${j + 1}`, name: typeof t === 'string' ? t : t.name, status: 'pending', notes: '' }))
    });
    plan.updatedAt = new Date().toISOString();
    this._save(plan.id, plan);
    return { success: true, phaseId: `phase-${phaseNum}` };
  }

  renderPlanSummary(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return 'No active plan.';
    const lines = [`📋 Plan: ${plan.title} [${plan.status}]`];
    if (plan.description) lines.push(`   ${plan.description}`);
    for (const phase of plan.phases) {
      const icon = phase.status === 'done' ? '✅' : phase.status === 'in-progress' ? '🔄' : '⬜';
      const done = phase.tasks.filter(t => t.status === 'done').length;
      lines.push(`  ${icon} ${phase.id}: ${phase.name} (${done}/${phase.tasks.length})`);
      for (const task of phase.tasks) {
        const ti = task.status === 'done' ? '✓' : task.status === 'in-progress' ? '▸' : '○';
        lines.push(`      ${ti} ${task.id}: ${task.name}`);
      }
    }
    return lines.join('\n');
  }

  compactStatusLine(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return '';
    const total = plan.phases.reduce((s, p) => s + p.tasks.length, 0);
    const done = plan.phases.reduce((s, p) => s + p.tasks.filter(t => t.status === 'done').length, 0);
    return `[Plan: ${plan.title}] ${done}/${total} tasks done`;
  }

  renderPlansList() {
    const plans = this.listPlans();
    if (plans.length === 0) return 'No advanced plans found.';
    
    const lines = [];
    lines.push(chalk.bold('Advanced Plans:\n'));
    for (const p of plans) {
      const active = p.id === this.activePlanId ? chalk.green(' (active)') : '';
      lines.push(`  ${chalk.cyan(p.id)} - ${p.title}${active}`);
      lines.push(`      Status: ${p.status} | Created: ${p.createdAt?.slice(0, 10) || 'unknown'}`);
      lines.push(`      Phases: ${p.phases}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  renderPlanFull(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return 'Plan not found.';
    
    const lines = [];
    lines.push(chalk.bold(`\n${'='.repeat(50)}`));
    lines.push(chalk.bold(`Plan: ${plan.title}`));
    lines.push(chalk.bold('='.repeat(50)));
    if (plan.description) lines.push(chalk.gray(plan.description));
    lines.push('');
    
    for (const phase of plan.phases) {
      const phaseDone = phase.tasks.every(t => t.status === 'done');
      const phaseStatus = phaseDone ? chalk.green('✓') : (phase.status === 'in-progress' ? chalk.yellow('◐') : chalk.gray('○'));
      lines.push(chalk.bold(`\n${phaseStatus} ${phase.name}`));
      
      for (const task of phase.tasks) {
        const taskDone = task.status === 'done';
        const taskStatus = taskDone ? chalk.green('✓') : (task.status === 'in-progress' ? chalk.yellow('◐') : (task.status === 'blocked' ? chalk.red('✗') : chalk.gray('○')));
        lines.push(`     ${taskStatus} ${task.id} ${task.name}${taskDone ? ' ' + chalk.green('done') : ''}`);
      }
    }
    
    const total = plan.phases.reduce((s, p) => s + p.tasks.length, 0);
    const done = plan.phases.reduce((s, p) => s + p.tasks.filter(t => t.status === 'done').length, 0);
    lines.push(chalk.bold(`\nProgress: ${done}/${total} tasks complete`));
    lines.push('');
    
    return lines.join('\n');
  }

  _save(id, data) { fs.writeFileSync(path.join(this.planDir, `${id}.json`), JSON.stringify(data, null, 2), 'utf8'); }
}

function buildPlanManagerTools(planManager) {
  return {
    create_advanced_plan: {
      description: 'Create a professional multi-phase development plan with phases and tasks. Each phase contains ordered tasks. Use this for complex projects requiring structured planning.',
      params: {
        title: 'string (required)', description: 'string (optional)',
        phases: 'array (required, each: {name: string, tasks: [string]})',
        priority: 'string (optional, low/medium/high/critical, default medium)',
        tags: 'array of strings (optional)'
      },
      handler: async ({ title, description, phases, priority, tags }) => {
        if (!title) return { error: 'Missing required: "title"' };
        if (!phases || !Array.isArray(phases)) return { error: 'Missing required: "phases" (array of {name, tasks})' };
        try { return planManager.createPlan({ title, description, phases, priority, tags }); }
        catch (e) { return { error: e.message }; }
      }
    },
    get_advanced_plan: {
      description: 'Get the full details of the active advanced plan or a specific plan by ID.',
      params: { plan_id: 'string (optional)' },
      handler: async ({ plan_id }) => {
        const plan = planManager.getPlan(plan_id);
        return plan ? { plan, summary: planManager.renderPlanSummary(plan_id) } : { error: 'No plan found.' };
      }
    },
    list_plans: {
      description: 'List all advanced plans.',
      params: {},
      handler: async () => ({ plans: planManager.listPlans() })
    },
    update_plan_task: {
      description: 'Update the status of a specific task within an advanced plan.',
      params: { plan_id: 'string (optional)', task_id: 'string (required, e.g. "1.2")', status: 'string (required, pending/in-progress/done/blocked)', notes: 'string (optional)' },
      handler: async ({ plan_id, task_id, status, notes }) => {
        if (!task_id) return { error: 'Missing: "task_id"' };
        if (!status) return { error: 'Missing: "status"' };
        return planManager.updateTaskStatus(plan_id || planManager.activePlanId, task_id, status, notes);
      }
    },
    add_plan_phase: {
      description: 'Add a new phase with tasks to an existing advanced plan.',
      params: { plan_id: 'string (optional)', name: 'string (required)', tasks: 'array of strings (required)' },
      handler: async ({ plan_id, name, tasks }) => {
        if (!name) return { error: 'Missing: "name"' };
        return planManager.addPhase(plan_id || planManager.activePlanId, name, tasks || []);
      }
    }
  };
}

module.exports = { PlanManager, buildPlanManagerTools };
