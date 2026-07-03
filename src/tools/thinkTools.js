'use strict';

/**
 * The "think" tool doesn't execute anything - it gives the model a scratchpad to reason
 * out loud (analyze a previous tool result, weigh options, plan multiple steps ahead)
 * before committing to an action.
 */
function buildThinkTools(thinkLog) {
  return {
    think: {
      description: 'Record a reasoning step (not a real action) - use it to analyze a previous tool result, weigh multiple options before deciding, or plan several steps ahead before acting',
      params: { thought: 'string (required)' },
      handler: async ({ thought }) => {
        thinkLog.push({ at: Date.now(), thought });
    if (thinkLog.length > 100) thinkLog.shift();
        return { recorded: true, total_thoughts: thinkLog.length };
      }
    }
  };
}

module.exports = { buildThinkTools };
