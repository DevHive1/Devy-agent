'use strict';
const chalk = require('chalk');

/**
 * Maps a tool name to a distinct icon so the terminal output makes it obvious at a glance
 * whether the agent is reading, writing, editing, running a shell command, touching git,
 * calling GitHub, planning, or just thinking - instead of every action looking identical.
 */
const ICON_RULES = [
  { match: (n) => n === 'read_file' || n === 'list_dir' || n === 'search_code' || n === 'find_files' || n === 'read_many_files' || n === 'file_info', icon: '📖' },
  { match: (n) => n === 'write_file', icon: '📝' },
  { match: (n) => n === 'edit_file', icon: '✏️ ' },
  { match: (n) => ['make_dir', 'move_path', 'copy_path', 'delete_path'].includes(n), icon: '🗂️ ' },
  { match: (n) => n === 'execute_command', icon: '💻' },
  { match: (n) => n.startsWith('git_'), icon: '🔧' },
  { match: (n) => n.startsWith('gh_actions_'), icon: '⚡' },
  { match: (n) => n.startsWith('gh_'), icon: '🐙' },
  { match: (n) => ['create_plan', 'update_task', 'add_task', 'get_plan'].includes(n), icon: '📋' },
  { match: (n) => n.startsWith('memory_'), icon: '🧠' },
  { match: (n) => ['detect_project', 'run_tests', 'check_tool_installed'].includes(n), icon: '🩺' },
  { match: (n) => n === 'set_project', icon: '📁' },
  { match: (n) => n === 'think', icon: '🤔' }
];

const { renderThought, renderInfo, renderWarning, renderError, renderFinal } = require('../ui/notificationToast');
const { renderStepIndicator } = require('../ui/progressTracker');

function iconFor(tool) {
  const rule = ICON_RULES.find((r) => r.match(tool));
  return rule ? rule.icon : '⚙️ ';
}

/**
 * Unified logger for all of the agent's visual output. Kept compact so terminal
 * transcripts stay readable and token-light where they get echoed back.
 */
const logger = {
  thought(text) {
    console.log(renderThought(text));
  },
  action(tool, params) {
    // Keep action logged minimally in case other tools look for stdout,
    // or let it print nicely.
    const paramsStr = JSON.stringify(params);
    const short = paramsStr.length > 200 ? paramsStr.slice(0, 200) + '…' : paramsStr;
    console.log(chalk.cyan(`\n${iconFor(tool)} `) + chalk.cyanBright(tool) + chalk.gray(' ' + short));
  },
  observation(text) {
    // Truncate observation preview for the CLI
    const short = text.length > 500 ? text.slice(0, 500) + '\n…(truncated for display only, full text was kept)' : text;
    console.log(chalk.dim('📋 Result: ') + chalk.dim(short));
  },
  final(text) {
    console.log('\n' + renderFinal(text));
  },
  info(text) {
    console.log(renderInfo(text));
  },
  warn(text) {
    console.log(renderWarning(text));
  },
  error(text) {
    console.log(renderError(text));
  },
  stopped(text) {
    console.log(chalk.yellow('\n⏹  ' + text + '\n'));
  },
  step(n, max) {
    console.log(renderStepIndicator(n, max));
  },
  compress(beforeTokens, afterTokens) {
    console.log(chalk.gray(`🗜️  Context compressed: ~${beforeTokens} → ~${afterTokens} tokens`));
  }
};

module.exports = logger;

