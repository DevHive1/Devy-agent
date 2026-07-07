'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

class SubagentTree {
  constructor() {
    this.subagents = new Map();
  }

  updateSubagent(id, { task, status, step, maxSteps, lastAction, duration }) {
    this.subagents.set(id, { task, status, step, maxSteps, lastAction, duration });
  }

  removeSubagent(id) {
    this.subagents.delete(id);
  }

  render() {
    if (this.subagents.size === 0) return '';

    const width = Math.min(getWidth(), 80);
    const contentWidth = width - 6;

    const title = ` ${ICONS.subagent}  Subagents (${this.subagents.size} active) `;
    const borderTop = colors.brand('╭─' + title + '─'.repeat(Math.max(4, contentWidth - title.length)) + '╮');
    const borderBottom = colors.brand('╰' + '─'.repeat(contentWidth) + '╯');
    const pipe = colors.brand(ICONS.pipe);

    const lines = [borderTop];
    let idx = 0;
    const size = this.subagents.size;

    for (const [id, sub] of this.subagents.entries()) {
      idx++;
      const isLast = idx === size;
      const branchSymbol = isLast ? ICONS.corner + '─' : ICONS.branch + '─';

      const taskTruncated = sub.task.length > 40 ? sub.task.slice(0, 37) + '...' : sub.task;
      const agentLine = `  ${branchSymbol} ${colors.bold.brandGlow('#' + id)} "${colors.text(taskTruncated)}"`;
      lines.push(`  ${pipe} ${agentLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(agentLine).length - 1))} ${pipe}`);

      // Status detail line
      const stepStr = sub.step ? ` · Step ${sub.step}/${sub.maxSteps || 20}` : '';
      const actionStr = sub.lastAction ? ` · Last: ${sub.lastAction}` : '';
      const statusColor = sub.status === 'done' ? colors.success : colors.warning;
      const statusIcon = sub.status === 'done' ? ICONS.success : ICONS.running;

      const indent = ' '.repeat(5);
      const detailLine = `  ${indent} ${statusColor(statusIcon)} ${statusColor(sub.status.toUpperCase())}${colors.textDim(stepStr)}${colors.textMuted(actionStr)}`;
      
      // Pad and wrap
      const displayDetail = detailLine.length > contentWidth - 4 ? detailLine.slice(0, contentWidth - 7) + '...' : detailLine;
      lines.push(`  ${pipe} ${displayDetail}${' '.repeat(Math.max(0, contentWidth - stripAnsi(displayDetail).length - 1))} ${pipe}`);
      
      // Empty padding line between subagents (if not last)
      if (!isLast) {
        lines.push(`  ${pipe}   ${colors.border('│')}${' '.repeat(contentWidth - 6)} ${pipe}`);
      }
    }

    lines.push(borderBottom);
    return lines.join('\n');
  }
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = new SubagentTree();
