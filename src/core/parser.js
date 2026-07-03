'use strict';

/**
 * Escapes raw control characters (newlines, carriage returns, tabs) inside double quotes.
 */
function sanitizeJsonString(str) {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (escape) {
        result += char;
        escape = false;
      } else if (char === '\\') {
        result += char;
        escape = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }
  return result;
}

/**
 * Repairs basic JSON syntax errors like trailing commas and raw control characters.
 */
function repairJson(c) {
  // Clean trailing commas in objects and arrays
  let repaired = c.replace(/,\s*([\]}])/g, '$1');
  // Escape literal newlines/tabs inside string values
  return sanitizeJsonString(repaired);
}

/**
 * Repairs JavaScript object-literal styling (single quotes and unquoted keys).
 */
function repairSingleQuotesAndKeys(c) {
  // Replace single quotes around keys: 'key': -> "key":
  let repaired = c.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '"$1":');
  // Replace single quotes around string values: : 'value' -> : "value"
  repaired = repaired.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"');
  // Replace single quotes in arrays: ['val1', 'val2'] -> ["val1", "val2"]
  repaired = repaired.replace(/([,\[])\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, '$1"$2"');
  // Replace single quotes before closing brackets/braces: 'value' } -> "value" }
  repaired = repaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*([,\]}])/g, '"$1"$2');
  // Clean trailing commas
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');
  // Clean unquoted keys: {tool: "git"} -> {"tool": "git"}
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  // Escape control characters
  return sanitizeJsonString(repaired);
}

/**
 * Tries to find and parse the first/best valid JSON block inside a text, even if it's
 * surrounded by prose or wrapped in ```json fences.
 */
function extractJson(text) {
  if (!text) return null;
  let cleaned = text.replace(/```json/gi, '```').trim();

  const candidates = [];
  const fenceMatch = cleaned.match(/```\s*([\s\S]*?)```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(cleaned.slice(firstBrace, i + 1));
          break;
        }
      }
    }
  }

  candidates.push(cleaned);

  for (const c of candidates) {
    // 1. Try standard parse
    try {
      return JSON.parse(c);
    } catch (_) {}

    // 2. Try simple repairs (trailing commas, control chars in strings)
    try {
      const repaired = repairJson(c);
      return JSON.parse(repaired);
    } catch (_) {}

    // 3. Try parsing single quotes and unquoted keys
    try {
      const repaired = repairSingleQuotesAndKeys(c);
      return JSON.parse(repaired);
    } catch (_) {}
  }
  return null;
}

/**
 * Agent protocol (extended ReAct):
 * THINK: ...        -> free-form reasoning (can span multiple lines, can repeat before an action)
 * ACTION: {json}     -> call a tool
 * FINAL: ...         -> final reply to the user
 *
 * Reads the full model response and extracts the first actionable directive (ACTION or FINAL),
 * along with all the reasoning that preceded it.
 */
function parseAgentResponse(raw) {
  if (!raw) return { thoughts: [], type: 'empty' };

  const thoughts = [];
  const thinkMatches = [...raw.matchAll(/THINK:\s*([\s\S]*?)(?=\n(?:THINK:|ACTION:|FINAL:)|$)/gi)];
  thinkMatches.forEach((m) => thoughts.push(m[1].trim()));

  const actionMatch = raw.match(/ACTION:\s*([\s\S]*?)(?=\nFINAL:|$)/i);
  if (actionMatch) {
    const json = extractJson(actionMatch[1]);
    if (json && json.tool) {
      return { thoughts, type: 'action', tool: json.tool, params: json.params || {} };
    }
    // The model wrote "ACTION:" but the payload isn't valid { tool, params } JSON.
    // Surface this as a recoverable protocol error instead of silently treating it as final text.
    return { thoughts, type: 'malformed_action', raw: actionMatch[1].trim() };
  }

  const finalMatch = raw.match(/FINAL:\s*([\s\S]*)/i);
  if (finalMatch) {
    return { thoughts, type: 'final', text: finalMatch[1].trim() };
  }

  // The model didn't follow the protocol at all - treat the whole reply as final rather than looping forever.
  return { thoughts, type: 'final', text: raw.trim() };
}

module.exports = { extractJson, parseAgentResponse };
