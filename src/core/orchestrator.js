'use strict';
const logger = require('../utils/logger');
const { parseAgentResponse } = require('./parser');
const eventBus = require('./eventBus');
const output = require('../utils/outputRenderer');
const { NetworkError, ProtocolError } = require('../utils/errors');
const container = require('../utils/container');
const StreamRenderer = require('../ui/streamRenderer');
const Spinner = require('../ui/spinner');

const MAX_CONSECUTIVE_PROTOCOL_ERRORS = 3;

class Orchestrator {
  constructor({ llmClient, tools, contextManager, systemPrompt, maxSteps, approvalPolicy, approvalManager }) {
    this.llmClient = llmClient;
    this.tools = tools;
    this.contextManager = contextManager;
    this.systemPrompt = systemPrompt;
    this.maxSteps = maxSteps;
    this.approvalPolicy = approvalPolicy || 'suggest';
    this.approvalManager = approvalManager;
    this.currentAbortController = null;

    // Resolve core services from container
    this.planStore = container.resolve('planStore');
    this.chatLog = container.resolve('chatLog');
    this.projectContext = container.resolve('projectContext');
    this.thinkLog = container.resolve('thinkLog');
    this.memoryStore = container.resolve('memoryStore');
    this.planManager = container.resolve('planManager');
  }

  /** Stops the in-flight model call (if any). Used by the CLI's Ctrl+C handler. */
  abort() {
    if (this.currentAbortController) this.currentAbortController.abort();
  }

  async runTask(userInput) {
    this.contextManager.addMessage('user', userInput);
    const toolsExecuted = [];

    // Auto-suggest skills based on the task
    try {
      const skillSuggester = container.resolve('skillSuggester');
      if (skillSuggester) {
        const suggestions = await skillSuggester.suggestSkills(userInput);
        if (suggestions && suggestions.length > 0) {
          const strongMatches = suggestions.filter(s => s.score >= 2);
          if (strongMatches.length > 0) {
            const listStr = strongMatches.map(s => `- ${s.name}: ${s.description}`).join('\n');
            const notice = `[System Notice] The following installed skills match your task. You must call use_skill with the skill name to read their instructions before proceeding:\n${listStr}`;
            this.contextManager.addMessage('user', notice);
          }
        }
      }
    } catch (e) {
      logger.warn(`Failed to auto-suggest skills: ${e.message}`);
    }

    let consecutiveProtocolErrors = 0;

    for (let step = 1; step <= this.maxSteps; step++) {
      eventBus.emit('agent:step', { step, maxSteps: this.maxSteps });

      if (this.contextManager.shouldCompress()) {
        await this.contextManager.compress(this.llmClient);
      }

      const planLine = this.planStore.compactStatusLine();
      const advPlanLine = this.planManager?.compactStatusLine();
      let sysPrompt = this.systemPrompt;
      if (this.projectContext && this.projectContext.projectName) {
        sysPrompt += `\n\n[Active project] ${this.projectContext.projectName} (${this.projectContext.dir})`;
      }
      if (planLine) sysPrompt += `\n\n[Current task list status] ${planLine}`;
      if (advPlanLine) sysPrompt += `\n\n[Current advanced plan status] ${advPlanLine}`;
      const messages = this.contextManager.buildPromptMessages(sysPrompt);

      logger.step(step, this.maxSteps);
      let raw;
      this.currentAbortController = new AbortController();
      eventBus.emit('llm:start', { messages });
      
      const spinner = new Spinner('Generating response...');
      spinner.start();
      
      const streamRenderer = new StreamRenderer();
      let hasTokens = false;

      try {
        raw = await this.llmClient.chat(messages, {
          temperature: 0.2,
          stream: true,
          onToken: (token) => {
            if (!hasTokens) {
              hasTokens = true;
              spinner.stop();
              streamRenderer.start();
            }
            streamRenderer.writeToken(token);
          },
          signal: this.currentAbortController.signal
        });
        
        if (hasTokens) {
          streamRenderer.finish();
        } else {
          spinner.stop();
        }
        
        eventBus.emit('llm:end', { raw });
      } catch (e) {
        if (hasTokens) {
          streamRenderer.finish();
        } else {
          spinner.stop();
        }
        this.currentAbortController = null;
        if (e.aborted) {
          logger.stopped('Task stopped.');
          return null;
        }
        
        const error = e.name === 'FetchError' || e.code === 'ENOTFOUND' 
          ? new NetworkError(`LLM Connection failed: ${e.message}`) 
          : new ProtocolError(`LLM Protocol failure: ${e.message}`);

        logger.error(`[${error.name}] ${error.message}`);
        return null;
      }
      this.currentAbortController = null;

      const parsed = parseAgentResponse(raw);
      parsed.thoughts.forEach((t) => logger.thought(t));
      this.contextManager.addMessage('assistant', raw);

      if (parsed.type === 'malformed_action') {
        consecutiveProtocolErrors += 1;
        logger.warn('The model returned an ACTION block that could not be parsed - asking it to retry with the correct format.');
        if (consecutiveProtocolErrors >= MAX_CONSECUTIVE_PROTOCOL_ERRORS) {
          logger.error(`Stopping after ${MAX_CONSECUTIVE_PROTOCOL_ERRORS} consecutive malformed responses from the model. Try rephrasing the request, or switch model with /model.`);
          return null;
        }
        this.contextManager.addMessage(
          'user',
          'OBSERVATION: Your last ACTION could not be parsed. It must be valid JSON on its own, in the exact form: ACTION: {"tool": "tool_name", "params": {...}}. Please retry with correctly formatted JSON.'
        );
        continue;
      }

      consecutiveProtocolErrors = 0;

      if (parsed.type === 'final') {
        logger.final(parsed.text);
        if (this.chatLog) {
          this.chatLog.appendTurn({
            userInput,
            toolsExecuted,
            response: parsed.text
          });
        }
        eventBus.emit('agent:final', { text: parsed.text });
        await this._autoLogMemory(userInput);
        return parsed.text;
      }

      if (parsed.type === 'action') {
        const { tool, params } = parsed;
        toolsExecuted.push({ tool, params });
        logger.action(tool, params);
        console.log(output.toolCallStart(tool, params));

        let result;
        if (!this.tools[tool]) {
          result = { error: `Tool "${tool}" does not exist. Only use tool names listed in the system prompt.` };
        } else {
          let approved = true;
          let rejectReason = '';
          if (this.approvalManager) {
            try {
              const decision = await this.approvalManager.shouldApprove(tool, params || {});
              if (!decision.approved) {
                approved = false;
                rejectReason = decision.reason || 'User denied permission.';
              }
            } catch (err) {
              approved = false;
              rejectReason = `Approval error: ${err.message}`;
            }
          }

          if (!approved) {
            result = { error: `Permission Denied: ${rejectReason}` };
            logger.warn(`Permission Denied: ${rejectReason}`);
          } else {
            eventBus.emit('tool:before', { tool, params });
            const toolStart = Date.now();
            try {
              result = await this.tools[tool].handler(params || {});
            } catch (e) {
              result = { error: e.message };
            }
            const toolDuration = Date.now() - toolStart;
            eventBus.emit('tool:after', { tool, params, result });
            console.log(output.toolCallResult(tool, result, toolDuration));
          }
        }

        const compactResult = this.contextManager.truncateToolOutput(tool, result);
        const observationText = `OBSERVATION (${tool}): ${JSON.stringify(compactResult)}`;
        logger.observation(JSON.stringify(result));
        this.contextManager.addMessage('user', observationText);
        continue;
      }

      // Empty or otherwise unrecognized response - treat as final so the loop doesn't spin forever.
      logger.final(raw);
      if (this.chatLog) {
        this.chatLog.appendTurn({
          userInput,
          toolsExecuted,
          response: raw
        });
      }
      eventBus.emit('agent:final', { text: raw });
      await this._autoLogMemory(userInput);
      return raw;
    }

    logger.warn(`Reached the maximum number of steps (${this.maxSteps}) without finishing. Use /plan and /task to check progress, then continue with a follow-up message.`);
    if (this.chatLog) {
      this.chatLog.appendTurn({
        userInput,
        toolsExecuted,
        response: `[Agent reached step limit ${this.maxSteps} without finalizing]`
      });
    }
    await this._autoLogMemory(userInput);
    return null;
  }

  async _autoLogMemory(userInput) {
    if (!this.memoryStore || !this.llmClient) return;
    try {
      const messages = this.contextManager.messages;
      if (messages.length === 0) return;

      const currentMemory = this.memoryStore.read();
      
      const summarizePrompt = [
        {
          role: 'system',
          content: `You are an expert technical archivist. Analyze the following chat log of a development session and integrate any new findings, changes, or conventions into the existing Project Memory Markdown.
          
Maintain a professional, structured, and detailed documentation. Add entries to the Task Log, update the Tech Stack, document any established Conventions/Decisions, and record any Gotchas/Environment quirks.

Ensure you do not lose any existing information that remains valid, but refine, clean up, and reorganize if needed.
Existing Memory:
${currentMemory}

Output the updated Project Memory markdown ONLY. Do not write any other explanation or markdown code block wrapper.`
        },
        {
          role: 'user',
          content: messages.map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content.slice(0, 1500) : JSON.stringify(m.content).slice(0, 1500)}`).join('\n').slice(-15000)
        }
      ];

      const updatedMemory = await this.llmClient.chat(summarizePrompt, { temperature: 0.1 });
      if (updatedMemory && updatedMemory.trim().startsWith('# Project Memory')) {
        this.memoryStore.overwrite(updatedMemory.trim());
      } else {
        const planLine = this.planStore?.compactStatusLine() || (this.planManager ? this.planManager.compactStatusLine() : '');
        const note = `Completed session task: "${userInput.slice(0, 100)}${userInput.length > 100 ? '...' : ''}". ${planLine ? `Status: ${planLine}` : ''}`;
        this.memoryStore.append(note);
      }
    } catch (_) {
      try {
        const planLine = this.planStore?.compactStatusLine() || (this.planManager ? this.planManager.compactStatusLine() : '');
        const note = `Completed session task: "${userInput.slice(0, 100)}${userInput.length > 100 ? '...' : ''}". ${planLine ? `Status: ${planLine}` : ''}`;
        this.memoryStore.append(note);
      } catch (__) {}
    }
  }
}

module.exports = { Orchestrator };
