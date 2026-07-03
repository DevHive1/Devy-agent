'use strict';
const chalk = require('chalk');

/**
 * Professional output renderer for the CLI agent.
 * Provides rich, structured, and color-coded output formatting.
 */

const ICONS = {
  success: '✅', error: '❌', warning: '⚠️ ', info: 'ℹ️ ', debug: '🔧',
  thinking: '💭', tool: '🔧', plan: '📋', skill: '🎯', file: '📄',
  git: '🔀', search: '🔍', web: '🌐', memory: '🧠', clock: '⏱️',
  rocket: '🚀', check: '✓', cross: '✗', arrow: '→', dot: '•',
  star: '⭐', lock: '🔒', key: '🔑', folder: '📁', terminal: '💻',
  database: '🗄️', package: '📦', bug: '🐛', lightbulb: '💡'
};

const COLORS = {
  primary: chalk.hex('#7C3AED'),
  secondary: chalk.hex('#06B6D4'),
  accent: chalk.hex('#F59E0B'),
  success: chalk.hex('#10B981'),
  error: chalk.hex('#EF4444'),
  warning: chalk.hex('#F59E0B'),
  muted: chalk.gray,
  dim: chalk.dim,
  highlight: chalk.hex('#EC4899'),
  info: chalk.hex('#3B82F6')
};

function banner(text) {
  const line = '═'.repeat(Math.max(text.length + 4, 40));
  return [
    COLORS.primary(line),
    COLORS.primary('║ ') + chalk.bold.white(text) + COLORS.primary(' '.repeat(Math.max(0, line.length - text.length - 4)) + ' ║'),
    COLORS.primary(line)
  ].join('\n');
}

function header(text, icon) {
  const prefix = icon ? `${icon}  ` : '';
  return '\n' + COLORS.primary('━'.repeat(50)) + '\n' + chalk.bold(`${prefix}${text}`) + '\n' + COLORS.primary('━'.repeat(50));
}

function section(title, content) {
  return `\n${chalk.bold(COLORS.secondary(title))}\n${content}`;
}

function toolCallStart(toolName, params) {
  const paramStr = params ? Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => {
    const val = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 57) + '...' : v) : JSON.stringify(v);
    return `${COLORS.muted(k)}=${COLORS.accent(val)}`;
  }).join(' ') : '';
  return `${ICONS.tool} ${COLORS.info(toolName)} ${paramStr}`;
}

function toolCallResult(toolName, result, durationMs) {
  const success = !result?.error;
  const icon = success ? ICONS.check : ICONS.cross;
  const color = success ? COLORS.success : COLORS.error;
  const duration = durationMs ? COLORS.muted(` (${durationMs}ms)`) : '';
  const preview = typeof result === 'string' ? result.slice(0, 120) :
    result?.error ? result.error.slice(0, 120) :
    result?.success ? 'done' :
    JSON.stringify(result).slice(0, 120);
  return `  ${color(icon)} ${COLORS.dim(toolName)}${duration} ${COLORS.muted('→')} ${preview}`;
}

function progressBar(current, total, width = 30) {
  const pct = Math.min(1, current / total);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = COLORS.success('█'.repeat(filled)) + COLORS.muted('░'.repeat(empty));
  return `${bar} ${COLORS.accent(`${Math.round(pct * 100)}%`)} (${current}/${total})`;
}

function stepIndicator(step, maxSteps) {
  return `${COLORS.muted('Step')} ${COLORS.accent(`${step}`)}${COLORS.muted(`/${maxSteps}`)}`;
}

function planSummary(plan) {
  if (!plan) return COLORS.muted('No active plan');
  const lines = [`${ICONS.plan} ${chalk.bold(plan.title || 'Untitled Plan')}`];
  if (plan.phases) {
    for (const phase of plan.phases) {
      const done = phase.tasks ? phase.tasks.filter(t => t.status === 'done').length : 0;
      const total = phase.tasks ? phase.tasks.length : 0;
      const icon = done === total && total > 0 ? ICONS.success : done > 0 ? '🔄' : '⬜';
      lines.push(`  ${icon} ${phase.name} ${progressBar(done, total, 15)}`);
    }
  }
  return lines.join('\n');
}

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || '').length)));
  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼');
  const line = (row) => row.map((cell, i) => ` ${String(cell || '').padEnd(widths[i])} `).join('│');
  return [
    COLORS.muted(sep),
    chalk.bold(line(headers)),
    COLORS.muted(sep),
    ...rows.map(r => line(r)),
    COLORS.muted(sep)
  ].join('\n');
}

function keyValue(pairs) {
  const maxKey = Math.max(...Object.keys(pairs).map(k => k.length));
  return Object.entries(pairs).map(([k, v]) =>
    `  ${COLORS.secondary(k.padEnd(maxKey))}  ${v}`
  ).join('\n');
}

function agentResponse(text) {
  return `\n${COLORS.primary('┌─')} ${ICONS.rocket} ${chalk.bold('Agent Response')}\n${COLORS.primary('│')}\n` +
    text.split('\n').map(l => `${COLORS.primary('│')} ${l}`).join('\n') +
    `\n${COLORS.primary('│')}\n${COLORS.primary('└─')}`;
}

module.exports = {
  ICONS, COLORS, banner, header, section, toolCallStart, toolCallResult,
  progressBar, stepIndicator, planSummary, table, keyValue, agentResponse
};
