'use strict';
const chalk = require('chalk');

function renderDiff(oldContent, newContent, filename) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');
  const lines = [];
  lines.push(chalk.gray(`--- a/${filename}`));
  lines.push(chalk.gray(`+++ b/${filename}`));
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) { lines.push(chalk.green(`+ ${newLines[i]}`)); }
    else if (i >= newLines.length) { lines.push(chalk.red(`- ${oldLines[i]}`)); }
    else if (oldLines[i] !== newLines[i]) { lines.push(chalk.red(`- ${oldLines[i]}`)); lines.push(chalk.green(`+ ${newLines[i]}`)); }
    else { lines.push(chalk.gray(`  ${oldLines[i]}`)); }
  }
  return lines.join('\n');
}

function renderCommandPreview(command, cwd) {
  const dangerPatterns = [/rm\s+-rf/i, /--force/i, /DROP\s+TABLE/i, /DELETE\s+FROM/i];
  const isDangerous = dangerPatterns.some(p => p.test(command));
  const lines = [];
  if (isDangerous) lines.push(chalk.red('⚠️  Potentially dangerous command'));
  lines.push(chalk.cyan(`$ ${command}`));
  if (cwd) lines.push(chalk.gray(`  cwd: ${cwd}`));
  return lines.join('\n');
}

module.exports = { renderDiff, renderCommandPreview };
