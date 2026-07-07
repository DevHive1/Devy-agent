'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

function renderApprovalCard(toolName, params, type = 'write') {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  let color = colors.warning;
  let icon = ICONS.write;
  let category = 'File Write Permission';

  if (type === 'destructive') {
    color = colors.error;
    icon = ICONS.warning;
    category = 'DESTRUCTIVE OPERATION';
  } else if (type === 'command') {
    color = colors.cyan;
    icon = ICONS.execute;
    category = 'Terminal Execution Permission';
  }

  const borderTop = color('╭─ ' + icon + '  ' + colors.bold(category) + ' ' + '─'.repeat(Math.max(4, contentWidth - category.length - 8)) + '╮');
  const borderBottom = color('╰' + '─'.repeat(contentWidth) + '╯');
  const pipe = color(ICONS.pipe);

  const lines = [borderTop];

  // Tool line
  const toolLine = `  Tool: ${colors.bold(toolName)}`;
  lines.push(`  ${pipe}${toolLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(toolLine).length))}${pipe}`);
  
  // Empty line
  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);

  // Render params
  if (params && Object.keys(params).length > 0) {
    for (const [key, val] of Object.entries(params)) {
      if (val === undefined || val === null) continue;
      let displayVal = typeof val === 'string' ? val : JSON.stringify(val);
      if (key === 'content' || key === 'code' || key === 'replacementContent') {
        displayVal = colors.italic(`[File contents: ${displayVal.split('\n').length} lines]`);
      } else if (displayVal.length > contentWidth - key.length - 8) {
        displayVal = displayVal.slice(0, contentWidth - key.length - 11) + '...';
      }

      const paramLine = `    ${colors.textDim(key)}: ${colors.text(displayVal)}`;
      lines.push(`  ${pipe}${paramLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(paramLine).length))}${pipe}`);
    }
  }

  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);

  const borderLine = colors.border('  ' + '─'.repeat(contentWidth - 4) + '  ');
  lines.push(`  ${pipe}${borderLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(borderLine).length))}${pipe}`);
  
  // Prompt instructions
  const promptLine = `  ${colors.bold('Approve this action?')} [Y/n] `;
  lines.push(`  ${pipe}${promptLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(promptLine).length))}${pipe}`);

  lines.push(borderBottom);

  return lines.join('\n');
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = {
  renderApprovalCard
};
