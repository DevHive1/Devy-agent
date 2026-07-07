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
    this.pinnedFiles = new Map(); // file relative path -> content
    if (cacheDir) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (err) {
        logger.error(`Failed to create cache directory "${cacheDir}":`, err);
      }
    }
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  /** Clears the active conversation (used by /clear). The plan and project memory are untouched. */
  reset() {
    this.messages = [];
    this.runningSummary = '';
    this._cacheCounter = 0;
    this.pinnedFiles.clear();
  }

  pinFile(filePath, content) {
    this.pinnedFiles.set(filePath, content);
  }

  unpinFile(filePath) {
    this.pinnedFiles.delete(filePath);
  }

  /** Re-points the tool-output cache at a new project's .devy-agent/cache (used by set_project). */
  setCacheDir(newCacheDir) {
    this.cacheDir = newCacheDir;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this._cacheCounter = 0;
  }

  truncateToolOutput(toolName, outputObj) {
    const str = typeof outputObj === 'string' ? outputObj : JSON.stringify(outputObj);
    if (str.length <= this.toolOutputMaxChars) return outputObj;

    this._cacheCounter += 1;
    const cacheFile = path.join(this.cacheDir, `tool_output_${this._cacheCounter}.txt`);
    try {
      fs.writeFileSync(cacheFile, str, 'utf8');
    } catch (_) { /* non-fatal - worst case the full output just isn't cached */ }

    // Smart truncation for terminal/command outputs
    if (outputObj && typeof outputObj === 'object' && ('stdout' in outputObj || 'stderr' in outputObj)) {
      const exit_code = outputObj.exit_code;
      const stdout = outputObj.stdout || '';
      const stderr = outputObj.stderr || '';

      const maxLimit = Math.floor(this.toolOutputMaxChars / 2);

      const smartTruncate = (text, limit) => {
        if (text.length <= limit) return text;
        const headLimit = Math.floor(limit * 0.25);
        const tailLimit = limit - headLimit;
        return `${text.slice(0, headLimit)}\n... [TRUNCATED ${text.length - limit} CHARS] ...\n${text.slice(-tailLimit)}`;
      };

      return {
        truncated: true,
        exit_code,
        stdout: smartTruncate(stdout, maxLimit),
        stderr: smartTruncate(stderr, maxLimit),
        full_length_chars: str.length,
        note: `Output was too long and was truncated to save context. The full output is cached locally at ${cacheFile}`
      };
    }

    const truncated = str.slice(0, this.toolOutputMaxChars);
    return {
      truncated: true,
      preview: truncated,
      full_length_chars: str.length,
      note: `Output was too long (${str.length} chars) and was truncated to save context. The full version is cached locally - if you need a specific part, use a tool with a bounded range (e.g. offset/limit) instead of requesting the whole thing again.`
    };
  }

  estimatePinnedFilesTokens() {
    let total = 0;
    for (const [path, content] of this.pinnedFiles.entries()) {
      total += estimateTokens(path) + estimateTokens(content) + 20;
    }
    return total;
  }

  estimateCurrentTokens() {
    return estimateTokens(this.runningSummary) + estimateMessagesTokens(this.messages) + this.estimatePinnedFilesTokens();
  }

  shouldCompress() {
    const used = this.estimateCurrentTokens();
    const isOverThreshold = used > this.contextLength * this.compressionThreshold;
    const hasCompressibleMessages = this.messages.length > this.keepRecentMessages;
    return isOverThreshold && hasCompressibleMessages;
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
    let sys = this.runningSummary
      ? `${systemPrompt}\n\n--- Compact summary of earlier progress on this task ---\n${this.runningSummary}`
      : systemPrompt;

    if (this.pinnedFiles.size > 0) {
      sys += '\n\n=== Pinned Workspace Files (Visible to you) ===';
      for (const [path, content] of this.pinnedFiles.entries()) {
        sys += `\n\nFile: ${path}\n\`\`\`\n${content}\n\`\`\``;
      }
    }
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
