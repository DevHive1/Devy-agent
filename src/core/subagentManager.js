'use strict';
const { ContextManager } = require('./contextManager');
const { parseAgentResponse } = require('./parser');
const eventBus = require('./eventBus');
const logger = require('../utils/logger');
const subagentTree = require('../ui/subagentTree');

// Simple in-memory cache for subagent results to reduce token consumption and API calls
const subagentCache = new Map();
const MAX_CACHE_SIZE = 100;


class SubagentManager {
  constructor({ llmClient, tools, systemPrompt, contextLength, compressionThreshold, toolOutputMaxChars, cacheDir }) {
    this.llmClient = llmClient;
    this.tools = tools;
    this.systemPrompt = systemPrompt;
    this.contextLength = contextLength;
    this.compressionThreshold = compressionThreshold;
    this.toolOutputMaxChars = toolOutputMaxChars;
    this.cacheDir = cacheDir;
    this.runningSubagents = new Set();
  }

  async spawn({ task, context, name, mode = 'sync', bypassCache = false }) {
    if (!task) throw new Error('Task prompt is required to spawn a subagent.');

    // Caching check
    const cacheKey = `${task}::${context || ''}`;
    if (!bypassCache && subagentCache.has(cacheKey)) {
      logger.info(`[Subagent] Cache hit for task: "${task.slice(0, 50)}..."`);
      const cachedVal = subagentCache.get(cacheKey);
      // LRU refresh: move to end
      subagentCache.delete(cacheKey);
      subagentCache.set(cacheKey, cachedVal);
      return cachedVal;
    }

    const cleanName = name ? name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') : 'subagent';
    const suffix = Math.random().toString(36).substring(2, 6);
    const subagentId = `${cleanName}-${suffix}`;
    const subagentCacheDir = `${this.cacheDir}/subagent_${subagentId}`;

    const subContextManager = new ContextManager({
      contextLength: this.contextLength,
      compressionThreshold: this.compressionThreshold,
      toolOutputMaxChars: this.toolOutputMaxChars,
      cacheDir: subagentCacheDir
    });

    // Share relevant state/context dynamically
    const subTaskPrompt = context ? `Context: ${context}\n\nTask: ${task}` : task;
    subContextManager.addMessage('user', subTaskPrompt);

    const runLoop = async () => {
      subagentTree.updateSubagent(subagentId, { task, status: 'running', step: 1, maxSteps: 20 });
      console.log(subagentTree.render());

      let consecutiveProtocolErrors = 0;
      const maxSteps = 20;

      for (let step = 1; step <= maxSteps; step++) {
        if (subContextManager.shouldCompress()) {
          await subContextManager.compress(this.llmClient);
        }

        const messages = subContextManager.buildPromptMessages(this.systemPrompt);
        let raw;
        
        // Auto-retry pattern with backoff for model calls
        let retries = 3;
        let delay = 1000;
        while (retries > 0) {
          try {
            subagentTree.updateSubagent(subagentId, { task, status: 'thinking', step, maxSteps });
            console.log(subagentTree.render());
            raw = await this.llmClient.chat(messages, { temperature: 0.2 });
            break;
          } catch (e) {
            retries--;
            if (retries === 0) {
              subagentTree.updateSubagent(subagentId, { task, status: 'failed', step, maxSteps, lastAction: `Failed: ${e.message}` });
              console.log(subagentTree.render());
              setTimeout(() => subagentTree.removeSubagent(subagentId), 3000);
              logger.error(`[Subagent ${subagentId}] Model call failed: ${e.message}`);
              return `Error: ${e.message}`;
            }
            logger.warn(`[Subagent ${subagentId}] Model call failed. Retrying in ${delay}ms... (Error: ${e.message})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
          }
        }

        const parsed = parseAgentResponse(raw);
        subContextManager.addMessage('assistant', raw);

        if (parsed.type === 'malformed_action') {
          consecutiveProtocolErrors += 1;
          if (consecutiveProtocolErrors >= 3) {
            subagentTree.updateSubagent(subagentId, { task, status: 'failed', step, maxSteps, lastAction: 'Protocol error' });
            console.log(subagentTree.render());
            setTimeout(() => subagentTree.removeSubagent(subagentId), 3000);
            return `Error: Too many consecutive protocol errors.`;
          }
          subContextManager.addMessage(
            'user',
            'OBSERVATION: Your last ACTION could not be parsed. Please retry with correctly formatted JSON.'
          );
          continue;
        }

        consecutiveProtocolErrors = 0;

        if (parsed.type === 'final') {
          subagentTree.updateSubagent(subagentId, { task, status: 'done', step, maxSteps });
          console.log(subagentTree.render());
          setTimeout(() => {
            subagentTree.removeSubagent(subagentId);
          }, 3000);

          // Token reduction: if response is very long, summarize or compress it
          let finalOutput = parsed.text;
          if (finalOutput.length > 3000 && this.llmClient) {
            logger.info(`[Subagent ${subagentId}] Compressing long output (${finalOutput.length} chars)`);
            try {
              const summaryPrompt = [
                { role: 'system', content: 'You are a precise technical summarizer. Compress the provided results into a structured, highly dense summary capturing all key outcomes, file paths, code changes, and test results. Retain exact paths, statistics, and commands.' },
                { role: 'user', content: `Summarize the following subagent work result:\n\n${finalOutput}` }
              ];
              const summaryResult = await this.llmClient.chat(summaryPrompt, { temperature: 0.1 });
              finalOutput = `[Summarized Subagent Result]\n${summaryResult}`;
            } catch (e) {
              logger.warn(`Failed to summarize subagent output: ${e.message}`);
            }
          }

          if (!bypassCache) {
            if (subagentCache.size >= MAX_CACHE_SIZE) {
              const oldestKey = subagentCache.keys().next().value;
              subagentCache.delete(oldestKey);
            }
            subagentCache.set(cacheKey, finalOutput);
          }
          return finalOutput;
        }

        if (parsed.type === 'action') {
          const { tool, params } = parsed;
          subagentTree.updateSubagent(subagentId, { task, status: 'running', step, maxSteps, lastAction: tool });
          console.log(subagentTree.render());
          
          let result;
          if (!this.tools[tool]) {
            result = { error: `Tool "${tool}" does not exist.` };
          } else {
            try {
              result = await this.tools[tool].handler(params || {});
            } catch (e) {
              result = { error: e.message };
            }
          }

          const compactResult = subContextManager.truncateToolOutput(tool, result);
          const observationText = `OBSERVATION (${tool}): ${JSON.stringify(compactResult)}`;
          subContextManager.addMessage('user', observationText);
          continue;
        }

        return raw;
      }

      subagentTree.updateSubagent(subagentId, { task, status: 'failed', step: maxSteps, maxSteps, lastAction: 'Timeout' });
      console.log(subagentTree.render());
      setTimeout(() => subagentTree.removeSubagent(subagentId), 3000);
      return `Error: Subagent reached maximum steps (${maxSteps}) without completing.`;
    };

    const promise = runLoop().finally(() => {
      this.runningSubagents.delete(promise);
    });

    this.runningSubagents.add(promise);

    if (mode === 'background') {
      return { subagentId, status: 'running', message: 'Subagent started in the background.' };
    }

    return await promise;
  }

  async spawnParallel(tasks) {
    let tasksArray = tasks;
    if (!Array.isArray(tasks)) {
      if (tasks && typeof tasks === 'object') {
        tasksArray = [tasks];
      } else if (typeof tasks === 'string') {
        tasksArray = [tasks];
      } else {
        throw new Error('Tasks must be an array.');
      }
    }

    const promises = tasksArray.map(t => {
      let taskPrompt = '';
      let context = '';
      let bypassCache = false;
      let name = '';

      if (typeof t === 'string') {
        taskPrompt = t;
      } else if (t && typeof t === 'object') {
        taskPrompt = t.task || t.prompt || t.instruction || t.command || t.text || t.query || '';
        context = t.context || '';
        bypassCache = !!t.bypassCache;
        name = t.name || t.label || t.role || '';
      }

      return this.spawn({
        task: taskPrompt,
        context,
        name,
        bypassCache,
        mode: 'sync'
      });
    });
    return Promise.all(promises);
  }

  getActiveCount() {
    return this.runningSubagents.size;
  }

  async waitAll() {
    const active = [...this.runningSubagents];
    if (active.length === 0) return [];
    return Promise.all(active);
  }
}

function buildSubagentTools(subagentManager) {
  return {
    spawn_subagent: {
      description: 'Spawn a single subagent to perform a specific independent task. Returns the task result once complete.',
      params: {
        task: 'string (required, the task prompt for the subagent)',
        context: 'string (optional, additional file content or context)',
        name: 'string (optional, a descriptive label/name for the subagent, e.g. "ui-design" or "database-fix")',
        bypassCache: 'boolean (optional, default false)'
      },
      handler: async (params = {}) => {
        try {
          const task = params.task || params.prompt || params.instruction || params.command || params.text || params.query;
          if (!task) return { error: 'Missing required parameter: "task"' };
          const result = await subagentManager.spawn({
            task,
            context: params.context || '',
            name: params.name || '',
            bypassCache: !!params.bypassCache,
            mode: 'sync'
          });
          return { result };
        } catch (e) {
          return { error: `Failed to spawn subagent: ${e.message}` };
        }
      }
    },

    spawn_subagents_parallel: {
      description: 'Spawn multiple subagents in parallel to perform independent tasks. Returns an array of results once all are complete.',
      params: {
        tasks: 'array (required) of { task: "string", context: "string (optional)", name: "string (optional)", bypassCache: "boolean (optional)" }'
      },
      handler: async ({ tasks }) => {
        try {
          const results = await subagentManager.spawnParallel(tasks);
          return { results };
        } catch (e) {
          return { error: `Failed to spawn parallel subagents: ${e.message}` };
        }
      }
    },

    wait_subagents: {
      description: 'Wait for all currently running background subagents to complete and collect their results.',
      params: {},
      handler: async () => {
        try {
          const results = await subagentManager.waitAll();
          return { results };
        } catch (e) {
          return { error: `Failed to wait for subagents: ${e.message}` };
        }
      }
    }
  };
}

module.exports = {
  SubagentManager,
  buildSubagentTools
};
