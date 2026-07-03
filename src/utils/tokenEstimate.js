'use strict';

/**
 * Fast, lightweight token estimate (no real tokenizer - cheaper on resource-constrained
 * devices like Termux). Rough rule of thumb: ~3.5-4 characters per token for a mix of
 * English/Arabic/code.
 */
function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(str.length / 3.5);
}

function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

module.exports = { estimateTokens, estimateMessagesTokens };
