'use strict';
const chalk = require('chalk');
const theme = require('../ui/theme');
const toolPanel = require('../ui/toolPanel');
const progressTracker = require('../ui/progressTracker');
const { getWidth } = require('../ui/layout');

const ICONS = theme.ICONS;
const COLORS = theme.colors;

function banner(text) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;
  const line = '═'.repeat(contentWidth);
  return [
    COLORS.brandDim('  ┌' + line + '┐'),
    COLORS.brandDim('  │ ') + chalk.bold.white(text.padEnd(contentWidth - 2)) + COLORS.brandDim(' │'),
    COLORS.brandDim('  └' + line + '┘')
  ].join('\n');
}

function header(text, icon) {
  const prefix = icon ? `${icon}  ` : '';
  return '\n' + COLORS.brandDim('━'.repeat(50)) + '\n' + chalk.bold(`${prefix}${text}`) + '\n' + COLORS.brandDim('━'.repeat(50));
}

function section(title, content) {
  return `\n${chalk.bold(COLORS.cyan(title))}\n${content}`;
}

function toolCallStart(toolName, params) {
  return toolPanel.renderToolStart(toolName, params);
}

function toolCallResult(toolName, result, durationMs) {
  return toolPanel.renderToolResult(toolName, result, durationMs);
}

function progressBar(current, total, width = 30) {
  return progressTracker.renderProgressBar(current, total, width);
}

function stepIndicator(step, maxSteps) {
  return progressTracker.renderStepIndicator(step, maxSteps);
}

function planSummary(plan) {
  // Map internal plan format to summary format for progressTracker
  const summary = {
    goal: plan.title,
    tasks: []
  };
  if (plan.phases) {
    plan.phases.forEach(phase => {
      if (phase.tasks) {
        phase.tasks.forEach(t => {
          summary.tasks.push({
            id: t.id,
            title: `${phase.name}: ${t.title}`,
            status: t.status,
            note: t.note
          });
        });
      }
    });
  }
  return progressTracker.renderPlanSummary(summary);
}

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || '').length)));
  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼');
  const line = (row) => row.map((cell, i) => ` ${String(cell || '').padEnd(widths[i])} `).join('│');
  return [
    COLORS.textMuted(sep),
    chalk.bold(line(headers)),
    COLORS.textMuted(sep),
    ...rows.map(r => line(r)),
    COLORS.textMuted(sep)
  ].join('\n');
}

function keyValue(pairs) {
  const maxKey = Math.max(...Object.keys(pairs).map(k => k.length));
  return Object.entries(pairs).map(([k, v]) =>
    `  ${COLORS.cyan(k.padEnd(maxKey))}  ${v}`
  ).join('\n');
}

function agentResponse(text) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;
  const pipe = COLORS.brand(ICONS.pipe);
  return `\n${COLORS.brand('┌─')} ${ICONS.sparkle} ${chalk.bold('Agent Response')}\n${COLORS.brand('│')}\n` +
    text.split('\n').map(l => `${pipe} ${l}`).join('\n') +
    `\n${COLORS.brand('│')}\n${COLORS.brand('└─')}`;
}

module.exports = {
  ICONS, COLORS, banner, header, section, toolCallStart, toolCallResult,
  progressBar, stepIndicator, planSummary, table, keyValue, agentResponse
};
