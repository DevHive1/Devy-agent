'use strict';
const fs = require('fs');
const path = require('path');
const { estimateTokens, estimateMessagesTokens } = require('../utils/tokenEstimate');
const logger = require('../utils/logger');
const eventBus = require('./eventBus');

class ContextManager {
  constructor({ contextLength, compressionThreshold, toolOutputMaxChars, cacheDir, keepRecentMessages }) {
    this.contextLength = contextLength;
    this.compressionThreshold = compressionThreshold;
    this.toolOutputMaxChars = toolOutputMaxChars;
    this.cacheDir = cacheDir;
    this.keepRecentMessages = keepRecentMessages !== undefined ? keepRecentMessages : 8;
    this.messages = []; // {role, content}
    this.runningSummary = ''; // compact summary of everything compressed so far
    this._cacheCounter = 0;
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  /** Clears the active conversation (used by /clear). The plan and project memory are untouched. */
  reset() {
    this.messages = [];
    this.runningSummary = '';
    this._cacheCounter = 0;
  }

  /** Re-points the tool-output cache at a new project's .devy-agent/cache (used by set_project). */
  setCacheDir(newCacheDir) {
    this.cacheDir = newCacheDir;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this._cacheCounter = 0;
  }

  /**
   * Truncates a large tool output, caches the full version to disk, and returns a short
   * version with a clear note the model can act on (e.g. re-read with offset/limit instead
   * of requesting the whole thing again).
   */
  truncateToolOutput(toolName, outputObj) {
    const str = typeof outputObj === 'string' ? outputObj : JSON.stringify(outputObj);
    if (str.length <= this.toolOutputMaxChars) return outputObj;

    this._cacheCounter += 1;
    const cacheFile = path.join(this.cacheDir, `tool_output_${this._cacheCounter}.txt`);
    try {
      fs.writeFileSync(cacheFile, str, 'utf8');
    } catch (_) { /* non-fatal - worst case the full output just isn't cached */ }

    const truncated = str.slice(0, this.toolOutputMaxChars);
    return {
      truncated: true,
      preview: truncated,
      full_length_chars: str.length,
      note: `Output was too long (${str.length} chars) and was truncated to save context. The full version is cached locally - if you need a specific part, use a tool with a bounded range (e.g. offset/limit) instead of requesting the whole thing again.`
    };
  }

  estimateCurrentTokens() {
    return estimateTokens(this.runningSummary) + estimateMessagesTokens(this.messages);
  }

  shouldCompress() {
    const used = this.estimateCurrentTokens();
    return used > this.contextLength * this.compressionThreshold;
  }

  /**
   * Summarizes the oldest part of the message history using the same model (a cheap, compact
   * call) and merges it into runningSummary, freeing up the active message list.
   */
  async compress(llmClient) {
    if (this.messages.length <= this.keepRecentMessages) return;

    const before = this.estimateCurrentTokens();
    const toSummarize = this.messages.slice(0, this.messages.length - this.keepRecentMessages);
    this.messages = this.messages.slice(this.messages.length - this.keepRecentMessages);

    const transcript = toSummarize
      .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    const summaryPrompt = [
      {
        role: 'system',
        content: 'Summarize the following conversation log very compactly. You must preserve: any decisions made, file/path names that were changed, important commit/sha numbers, results of important commands (success/failure), and anything needed to continue the task. Skip stylistic detail. Write the summary as a short paragraph or bullet points, no preamble.'
      },
      { role: 'user', content: transcript }
    ];

    try {
      const newSummary = await llmClient.chat(summaryPrompt, { temperature: 0.1 });
      this.runningSummary = this.runningSummary ? `${this.runningSummary}\n${newSummary}` : newSummary;
      const after = this.estimateCurrentTokens();
      logger.compress(before, after);
      eventBus.emit('context:compress', { before, after });
    } catch (e) {
      // If summarization fails, restore the messages rather than losing data.
      this.messages = [...toSummarize, ...this.messages];
      logger.warn('Context compression failed, continuing without it: ' + e.message);
    }
  }

  /** Builds the final message list actually sent to the model */
  buildPromptMessages(systemPrompt) {
    const sys = this.runningSummary
      ? `${systemPrompt}\n\n--- Compact summary of earlier progress on this task ---\n${this.runningSummary}`
      : systemPrompt;
    return [{ role: 'system', content: sys }, ...this.messages];
  }

  /** Returns a snapshot of the current context state */
  getContextSnapshot() {
    return {
      messages: JSON.parse(JSON.stringify(this.messages)),
      runningSummary: this.runningSummary,
      tokenEstimate: this.estimateCurrentTokens()
    };
  }
}

module.exports = { ContextManager };
