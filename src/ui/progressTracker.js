'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

function renderProgressBar(current, total, width = 30) {
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = colors.success('█'.repeat(filled)) + colors.border('░'.repeat(empty));
  const percentText = colors.bold.success(`${Math.round(pct * 100)}%`);
  return `${bar} ${percentText} (${current}/${total})`;
}

function renderStepIndicator(step, maxSteps) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 10;
  
  const stepLabel = ` Step ${colors.bold.brandGlow(step)} / ${maxSteps} `;
  
  // Create dot track
  const dotCount = 15;
  const activeDotIndex = Math.min(dotCount - 1, Math.floor((step / maxSteps) * dotCount));
  
  let dotTrack = '';
  for (let i = 0; i < dotCount; i++) {
    if (i === activeDotIndex) {
      dotTrack += colors.brandGlow(ICONS.running);
    } else if (i < activeDotIndex) {
      dotTrack += colors.success(ICONS.success);
    } else {
      dotTrack += colors.border(ICONS.pending);
    }
  }

  const borderLine = colors.border('─'.repeat(Math.max(2, Math.floor((contentWidth - stepLabel.length - dotCount) / 2))));
  
  return `\n${borderLine}${stepLabel}${colors.border('[')}${dotTrack}${colors.border(']')}${borderLine}\n`;
}

function renderPlanSummary(summary) {
  if (!summary.goal) return colors.textMuted('No active plan');

  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  const header = colors.bold.brand(`  ${ICONS.plan}  Plan Goal: ${summary.goal}`);
  const borderTop = colors.border('  ┌' + '─'.repeat(contentWidth) + '┐');
  const borderBottom = colors.border('  └' + '─'.repeat(contentWidth) + '┘');
  const pipe = colors.border(ICONS.pipe);

  const lines = [header, borderTop];

  // Progress Bar row
  const progressPercent = summary.tasks.length > 0 
    ? summary.tasks.filter(t => t.status === 'done').length / summary.tasks.length 
    : 0;
  const pBar = renderProgressBar(summary.tasks.filter(t => t.status === 'done').length, summary.tasks.length, 20);
  const progressLine = `  Progress: ${pBar}`;
  lines.push(`  ${pipe} ${progressLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(progressLine).length - 1))} ${pipe}`);
  
  // Divider
  lines.push(`  ${pipe} ${colors.border('─'.repeat(contentWidth - 2))} ${pipe}`);

  // List tasks
  summary.tasks.forEach(t => {
    let statusIcon = ICONS.pending;
    let statusColor = colors.textMuted;
    if (t.status === 'done') {
      statusIcon = ICONS.success;
      statusColor = colors.success;
    } else if (t.status === 'in_progress') {
      statusIcon = ICONS.running;
      statusColor = colors.warning;
    } else if (t.status === 'failed') {
      statusIcon = ICONS.failed;
      statusColor = colors.error;
    }

    const taskTitle = t.title.length > contentWidth - 12 ? t.title.slice(0, contentWidth - 15) + '...' : t.title;
    const taskLine = `  ${statusColor(statusIcon)}  #${t.id} ${colors.text(taskTitle)}`;
    lines.push(`  ${pipe} ${taskLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(taskLine).length - 1))} ${pipe}`);
    
    if (t.note) {
      const noteLine = `      ${colors.italic.textDim('└─ ' + t.note)}`;
      lines.push(`  ${pipe} ${noteLine}${' '.repeat(Math.max(0, contentWidth - stripAnsi(noteLine).length - 1))} ${pipe}`);
    }
  });

  lines.push(borderBottom);
  return lines.join('\n');
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = {
  renderProgressBar,
  renderStepIndicator,
  renderPlanSummary
};
