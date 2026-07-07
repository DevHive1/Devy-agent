'use strict';
const chalk = require('chalk');
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

function renderDiff(oldContent, newContent, filename) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  const header = colors.bold.brand(`  ${ICONS.git}  Diff: ${filename}`);
  const borderTop = colors.border('  ┌' + '─'.repeat(contentWidth) + '┐');
  const borderBottom = colors.border('  └' + '─'.repeat(contentWidth) + '┘');
  const pipe = colors.border(ICONS.pipe);

  const diffLines = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  // Quick diff generation
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) {
      diffLines.push(colors.success(`+ ${newLines[i]}`));
    } else if (i >= newLines.length) {
      diffLines.push(colors.error(`- ${oldLines[i]}`));
    } else if (oldLines[i] !== newLines[i]) {
      diffLines.push(colors.error(`- ${oldLines[i]}`));
      diffLines.push(colors.success(`+ ${newLines[i]}`));
    } else {
      diffLines.push(colors.textMuted(`  ${oldLines[i]}`));
    }
  }

  // To keep it compact, show only lines around changes (context window of 3 lines)
  const renderedLines = [];
  let inHunk = false;
  let linesSinceLastChange = 999;
  
  for (let i = 0; i < diffLines.length; i++) {
    const isChange = diffLines[i].startsWith('\u001b[38;2;52;211;153m+') || diffLines[i].startsWith('\u001b[38;2;248;113;113m-');
    
    if (isChange) {
      if (!inHunk) {
        // Start a new hunk, find some context before
        const start = Math.max(0, i - 3);
        if (start > 0 && renderedLines.length > 0) {
          renderedLines.push(colors.textMuted('  ...'));
        }
        for (let j = start; j < i; j++) {
          renderedLines.push(diffLines[j]);
        }
        inHunk = true;
      }
      renderedLines.push(diffLines[i]);
      linesSinceLastChange = 0;
    } else {
      linesSinceLastChange++;
      if (inHunk) {
        if (linesSinceLastChange <= 3) {
          renderedLines.push(diffLines[i]);
        } else {
          inHunk = false;
        }
      }
    }
  }

  if (renderedLines.length === 0 && diffLines.length > 0) {
    // If no changes, show first few lines
    renderedLines.push(...diffLines.slice(0, 5));
    if (diffLines.length > 5) renderedLines.push(colors.textMuted('  ...'));
  }

  const lines = [header, borderTop];
  for (const line of renderedLines) {
    // Ensure wrapping of line content inside borders
    const truncated = line.length > contentWidth ? line.slice(0, contentWidth - 3) + '...' : line;
    const padding = ' '.repeat(Math.max(0, contentWidth - stripAnsi(truncated).length));
    lines.push(`  ${pipe} ${truncated}${padding} ${pipe}`);
  }
  lines.push(borderBottom);

  return lines.join('\n');
}

function renderCommandPreview(command, cwd) {
  const dangerPatterns = [/rm\s+-rf/i, /--force/i, /DROP\s+TABLE/i, /DELETE\s+FROM/i];
  const isDangerous = dangerPatterns.some(p => p.test(command));
  
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;
  const pipe = colors.border(ICONS.pipe);

  const lines = [];
  lines.push(colors.border('  ┌' + '─'.repeat(contentWidth) + '┐'));
  
  if (isDangerous) {
    const dangerMsg = colors.bold.error(`  ${ICONS.warning}  Warning: Dangerous Command Detected!`);
    lines.push(`  ${pipe} ${dangerMsg}${' '.repeat(Math.max(0, contentWidth - stripAnsi(dangerMsg).length))} ${pipe}`);
  }
  
  const cmdLine = colors.cyan(`$ ${command}`);
  const padCmd = ' '.repeat(Math.max(0, contentWidth - stripAnsi(cmdLine).length));
  lines.push(`  ${pipe} ${cmdLine}${padCmd} ${pipe}`);
  
  if (cwd) {
    const cwdLine = colors.textMuted(`  cwd: ${cwd}`);
    const padCwd = ' '.repeat(Math.max(0, contentWidth - stripAnsi(cwdLine).length));
    lines.push(`  ${pipe} ${cwdLine}${padCwd} ${pipe}`);
  }
  
  lines.push(colors.border('  └' + '─'.repeat(contentWidth) + '┘'));
  return lines.join('\n');
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = { renderDiff, renderCommandPreview };
