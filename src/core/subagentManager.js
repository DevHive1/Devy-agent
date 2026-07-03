'use strict';
const { ContextManager } = require('./contextManager');
const { parseAgentResponse } = require('./parser');
const eventBus = require('./eventBus');
const logger = require('../utils/logger');

// Simple in-memory cache for subagent results to reduce token consumption and API calls
const subagentCache = new Map();

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

  async spawn({ task, context, mode = 'sync', bypassCache = false }) {
    if (!task) throw new Error('Task prompt is required to spawn a subagent.');

    // Caching check
    const cacheKey = `${task}::${context || ''}`;
    if (!bypassCache && subagentCache.has(cacheKey)) {
      logger.info(`[Subagent] Cache hit for task: "${task.slice(0, 50)}..."`);
      return subagentCache.get(cacheKey);
    }

    const subagentId = Math.random().toString(36).substring(2, 10);
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
      logger.info(`[Subagent ${subagentId}] Starting task: "${task.slice(0, 50)}..."`);
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
            raw = await this.llmClient.chat(messages, { temperature: 0.2 });
            break;
          } catch (e) {
            retries--;
            if (retries === 0) {
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
          logger.info(`[Subagent ${subagentId}] Completed successfully.`);
          
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
            subagentCache.set(cacheKey, finalOutput);
          }
          return finalOutput;
        }

        if (parsed.type === 'action') {
          const { tool, params } = parsed;
          logger.info(`[Subagent ${subagentId}] Action: ${tool}`);
          
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
    if (!Array.isArray(tasks)) throw new Error('Tasks must be an array.');
    const promises = tasks.map(t => this.spawn({
      task: typeof t === 'string' ? t : t.task,
      context: t.context,
      mode: 'sync'
    }));
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
    spawn_subagents_parallel: {
      description: 'Spawn multiple subagents in parallel to perform independent tasks. Returns an array of results once all are complete.',
      params: {
        tasks: 'array (required) of { task: "string", context: "string (optional)", bypassCache: "boolean (optional)" }'
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
