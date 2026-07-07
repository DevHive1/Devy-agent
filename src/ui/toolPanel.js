'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');
const { renderDiff, renderCommandPreview } = require('./diffPanel');

function iconFor(toolName) {
  if (toolName.startsWith('git_')) return ICONS.git;
  if (toolName.startsWith('gh_')) return ICONS.github;
  if (toolName === 'read_file' || toolName === 'list_dir' || toolName === 'find_files') return ICONS.read;
  if (toolName === 'write_file') return ICONS.write;
  if (toolName === 'edit_file' || toolName === 'multi_edit_file') return ICONS.edit;
  if (toolName === 'delete_path') return ICONS.delete;
  if (toolName === 'execute_command') return ICONS.execute;
  if (toolName === 'think') return ICONS.think;
  return ICONS.execute;
}

function colorFor(toolName) {
  if (toolName.startsWith('git_') || toolName.startsWith('gh_')) return colors.brand;
  if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'multi_edit_file') return colors.warning;
  if (toolName === 'delete_path') return colors.error;
  if (toolName === 'execute_command') return colors.cyan;
  return colors.info;
}

function renderToolStart(toolName, params) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;
  const icon = iconFor(toolName);
  const color = colorFor(toolName);
  const pipe = colors.border(ICONS.pipe);

  const lines = [];
  const title = ` ${icon}  ${toolName} `;
  const borderTop = color('┌─' + title + '─'.repeat(Math.max(4, contentWidth - title.length - 2)) + '┐');
  lines.push(borderTop);

  // Render params nicely
  if (params && Object.keys(params).length > 0) {
    for (const [key, val] of Object.entries(params)) {
      if (val === undefined || val === null) continue;
      
      let displayVal = typeof val === 'string' ? val : JSON.stringify(val);
      // If it is file content, truncate heavily to avoid printing pages of text
      if (key === 'content' || key === 'code' || key === 'replacementContent') {
        const lineCount = displayVal.split('\n').length;
        displayVal = colors.italic(`[File contents: ${lineCount} lines]`);
      } else if (displayVal.length > contentWidth - key.length - 8) {
        displayVal = displayVal.slice(0, contentWidth - key.length - 11) + '...';
      }

      const paramLine = `  ${colors.textDim(key)}: ${colors.text(displayVal)}`;
      const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(paramLine).length));
      lines.push(`  ${pipe}${paramLine}${pad}${pipe}`);
    }
  }

  // If executing command, show preview box
  if (toolName === 'execute_command' && params && params.command) {
    const preview = renderCommandPreview(params.command, params.cwd);
    // Split and add to lines
    preview.split('\n').forEach(l => lines.push(l));
  }

  return lines.join('\n');
}

function renderToolResult(toolName, result, durationMs) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;
  const color = colorFor(toolName);
  const pipe = colors.border(ICONS.pipe);

  const lines = [];
  const timeStr = durationMs ? ` ${durationMs}ms ` : '';
  const isSuccess = !result?.error;
  
  const statusIcon = isSuccess ? colors.success(ICONS.success) : colors.error(ICONS.failed);
  const statusLabel = isSuccess ? colors.success('SUCCESS') : colors.error('FAILURE');
  
  const midLine = `  ${pipe} ${'─'.repeat(contentWidth - 2)} ${pipe}`;
  lines.push(midLine);

  if (!isSuccess) {
    const errorMsg = `Error: ${result.error}`;
    const truncatedErr = errorMsg.length > contentWidth - 6 ? errorMsg.slice(0, contentWidth - 9) + '...' : errorMsg;
    const errLine = `  ${statusIcon}  ${colors.error(truncatedErr)}`;
    const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(errLine).length));
    lines.push(`  ${pipe}${errLine}${pad}${pipe}`);
  } else {
    // Render simple success details
    let summary = 'Operation completed';
    if (toolName === 'read_file' && result.content) {
      summary = `Read ${result.content.split('\n').length} lines (${(result.content.length / 1024).toFixed(2)} KB)`;
    } else if (toolName === 'list_dir' && result.files) {
      summary = `Listed ${result.files.length} items`;
    } else if (toolName === 'find_files' && result.matches) {
      summary = `Found ${result.matches.length} matches`;
    } else if (toolName === 'write_file') {
      summary = 'File written successfully';
    } else if (toolName === 'edit_file') {
      summary = 'File edited successfully';
    }

    const successLine = `  ${statusIcon}  ${colors.textDim(summary)}`;
    const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(successLine).length));
    lines.push(`  ${pipe}${successLine}${pad}${pipe}`);

    // If edit_file and we have the content before/after, render a diff preview
    if (toolName === 'edit_file' && result.oldContent !== undefined && result.newContent !== undefined) {
      const diff = renderDiff(result.oldContent, result.newContent, result.path || 'file');
      diff.split('\n').forEach(l => lines.push(l));
    }
  }

  const borderBottom = color('└─' + '─'.repeat(Math.max(4, contentWidth - timeStr.length - 2)) + timeStr + '┘');
  lines.push(borderBottom);

  return lines.join('\n') + '\n';
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = {
  renderToolStart,
  renderToolResult
};
