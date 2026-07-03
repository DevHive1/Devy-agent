'use strict';
const fs = require('fs');
const path = require('path');

const VALID_STATUSES = ['pending', 'in_progress', 'done', 'failed'];

/**
 * Coerces a raw task item into a clean title string. Defends against the model passing
 * already-structured task objects (e.g. {id, title, status, note}) instead of a plain
 * string - which previously got silently wrapped as-is and produced corrupted, nested
 * task entries.
 */
function coerceTitle(t) {
  if (typeof t === 'string') return t.trim();
  if (t && typeof t === 'object') {
    const candidate = t.title || t.name || t.task || t.description;
    if (typeof candidate === 'string') return candidate.trim();
  }
  return '';
}

function normalizeTasks(rawTasks) {
  if (!Array.isArray(rawTasks)) {
    return { error: '"tasks" must be an array of plain strings, e.g. ["Scaffold the project", "Add routing"].' };
  }
  const cleaned = rawTasks.map(coerceTitle).filter(Boolean);
  if (cleaned.length === 0) {
    return { error: 'No valid task titles found. Pass "tasks" as an array of plain strings, not objects with id/status fields.' };
  }
  return { tasks: cleaned };
}

/**
 * Plan/task store, persisted to <workspace>/.devy-agent/plan.json so the plan survives
 * across sessions and process restarts for the same project.
 */
class PlanStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.goal = null;
    this.tasks = []; // { id, title, status: pending|in_progress|done|failed, note }
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.goal = data.goal || null;
        this.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      }
    } catch (_) {
      // Corrupt or unreadable file - start fresh rather than crash.
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ goal: this.goal, tasks: this.tasks, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch (_) {
      // Non-fatal: plan just won't persist to disk this time.
    }
  }

  create(goal, cleanTitles) {
    this.goal = goal;
    this.tasks = cleanTitles.map((title, i) => ({ id: i + 1, title, status: 'pending', note: '' }));
    this._save();
    return this.summary();
  }

  addTask(title) {
    const id = this.tasks.length ? Math.max(...this.tasks.map((t) => t.id)) + 1 : 1;
    this.tasks.push({ id, title, status: 'pending', note: '' });
    this._save();
    return this.summary();
  }

  updateTask(id, status, note) {
    const numId = Number(id);
    const task = this.tasks.find((t) => t.id === numId);
    if (!task) {
      const validIds = this.tasks.map((t) => t.id).join(', ') || '(no tasks yet - call create_plan first)';
      return { error: `No task with id ${JSON.stringify(id)}. Valid ids in the current plan: ${validIds}` };
    }
    if (status) task.status = status;
    if (note !== undefined) task.note = note;
    this._save();
    return this.summary();
  }

  clear() {
    this.goal = null;
    this.tasks = [];
    this._save();
    return this.summary();
  }

  /** Re-point this store at a different project's plan.json (used by set_project). */
  switchTo(filePath) {
    this.filePath = filePath;
    this.goal = null;
    this.tasks = [];
    this._load();
  }

  /** Compact summary for context - not full detail, just what's needed to decide the next step */
  summary() {
    const done = this.tasks.filter((t) => t.status === 'done').length;
    return {
      goal: this.goal,
      progress: this.tasks.length ? `${done}/${this.tasks.length}` : '0/0',
      tasks: this.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, note: t.note || undefined }))
    };
  }

  /** A single-line status injected into the system prompt every step, instead of repeating full detail */
  compactStatusLine() {
    if (!this.tasks.length) return null;
    const current = this.tasks.find((t) => t.status === 'in_progress') || this.tasks.find((t) => t.status === 'pending');
    const done = this.tasks.filter((t) => t.status === 'done').length;
    return `Plan: "${this.goal}" — ${done}/${this.tasks.length} done. Current task: ${current ? `#${current.id} ${current.title}` : 'all tasks complete'}`;
  }
}

function buildPlanTools(planStore) {
  return {
    create_plan: {
      description: 'Break a large goal down into an ordered list of concrete, actionable subtasks - use this first for any non-trivial multi-step request. Persists to this project\'s .devy-agent folder',
      params: {
        goal: 'string (required)',
        tasks: 'array of plain strings (required), e.g. ["Scaffold the project", "Add routing", "Write tests"] - each a short, concrete, verifiable step. Do NOT pass objects with id/status fields, just plain text titles.'
      },
      handler: async ({ goal, tasks }) => {
        if (!goal || !String(goal).trim()) {
          return { error: 'Missing required "goal" - a short string describing the overall objective.' };
        }
        const norm = normalizeTasks(tasks);
        if (norm.error) return norm;
        return planStore.create(String(goal).trim(), norm.tasks);
      }
    },
    update_task: {
      description: `Update the status of a task in the current plan. "id" must be the numeric id shown by get_plan/create_plan (also accepts "task_id"/"taskId" as aliases). status must be one of: ${VALID_STATUSES.join(', ')}.`,
      params: { id: 'number (required)', status: `string (optional: ${VALID_STATUSES.join('/')})`, note: 'string (optional)' },
      handler: async (params = {}) => {
        const id = params.id ?? params.task_id ?? params.taskId;
        if (id === undefined || id === null || id === '') {
          return { error: 'Missing required "id" - pass the numeric task id shown in get_plan (the field must be named "id").' };
        }
        if (params.status && !VALID_STATUSES.includes(params.status)) {
          return { error: `Invalid status "${params.status}" - must be one of: ${VALID_STATUSES.join(', ')}.` };
        }
        return planStore.updateTask(id, params.status, params.note);
      }
    },
    add_task: {
      description: 'Add a new task to the current plan (e.g. an extra step turned out to be needed)',
      params: { title: 'string (required, plain text)' },
      handler: async ({ title }) => {
        const clean = coerceTitle(title);
        if (!clean) return { error: 'Missing required "title" - a plain text string.' };
        return planStore.addTask(clean);
      }
    },
    get_plan: {
      description: 'Show the full current plan with every task and its status',
      params: {},
      handler: async () => planStore.summary()
    }
  };
}

module.exports = { PlanStore, buildPlanTools };
