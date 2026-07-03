'use strict';
const logger = require('../utils/logger');
const { parseAgentResponse } = require('./parser');
const eventBus = require('./eventBus');
const output = require('../utils/outputRenderer');
const { NetworkError, ProtocolError } = require('../utils/errors');
const container = require('../utils/container');

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
  }

  /** Stops the in-flight model call (if any). Used by the CLI's Ctrl+C handler. */
  abort() {
    if (this.currentAbortController) this.currentAbortController.abort();
  }

  async runTask(userInput) {
    this.contextManager.addMessage('user', userInput);
    if (this.chatLog) this.chatLog.append('User', userInput);

    let consecutiveProtocolErrors = 0;

    for (let step = 1; step <= this.maxSteps; step++) {
      eventBus.emit('agent:step', { step, maxSteps: this.maxSteps });

      if (this.contextManager.shouldCompress()) {
        await this.contextManager.compress(this.llmClient);
      }

      const planLine = this.planStore.compactStatusLine();
      let sysPrompt = this.systemPrompt;
      if (this.projectContext && this.projectContext.projectName) {
        sysPrompt += `\n\n[Active project] ${this.projectContext.projectName} (${this.projectContext.dir})`;
      }
      if (planLine) sysPrompt += `\n\n[Current plan status] ${planLine}`;
      const messages = this.contextManager.buildPromptMessages(sysPrompt);

      logger.step(step, this.maxSteps);
      logger.info(output.stepIndicator(step, this.maxSteps));
      let raw;
      this.currentAbortController = new AbortController();
      eventBus.emit('llm:start', { messages });
      try {
        raw = await this.llmClient.chat(messages, { temperature: 0.2, signal: this.currentAbortController.signal });
        eventBus.emit('llm:end', { raw });
      } catch (e) {
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
        if (this.chatLog) this.chatLog.append('Devy Agent', parsed.text);
        eventBus.emit('agent:final', { text: parsed.text });
        return parsed.text;
      }

      if (parsed.type === 'action') {
        const { tool, params } = parsed;
        logger.action(tool, params);
        logger.info(output.toolCallStart(tool, params));

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
            logger.info(output.toolCallResult(tool, result, toolDuration));
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
      if (this.chatLog) this.chatLog.append('Devy Agent', raw);
      eventBus.emit('agent:final', { text: raw });
      return raw;
    }

    logger.warn(`Reached the maximum number of steps (${this.maxSteps}) without finishing. Use /plan and /task to check progress, then continue with a follow-up message.`);
    return null;
  }
}

module.exports = { Orchestrator };
