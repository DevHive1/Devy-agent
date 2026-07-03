'use strict';
const chalk = require('chalk');

const DESTRUCTIVE_TOOLS = new Set([
  'git_push',
  'git_reset',
  'git_clean',
  'delete_path',
  'git_revert',
  'git_merge'
]);

const WRITE_TOOLS = new Set([
  'write_file',
  'edit_file',
  'move_path',
  'copy_path',
  'make_dir'
]);

const COMMAND_TOOLS = new Set([
  'execute_command',
  'run_tests'
]);

class ApprovalManager {
  constructor({ mode = 'suggest', readlineInterface = null } = {}) {
    this.mode = mode; // 'suggest' | 'auto-edit' | 'full-auto'
    this.rl = readlineInterface;
  }

  setMode(mode) {
    if (['suggest', 'auto-edit', 'full-auto'].includes(mode)) {
      this.mode = mode;
      return true;
    }
    return false;
  }

  getMode() {
    return this.mode;
  }

  async shouldApprove(toolName, params) {
    // 1. Destructive operations always require approval in all modes
    if (DESTRUCTIVE_TOOLS.has(toolName)) {
      // For git_reset, check if it is soft or mixed (non-destructive).
      // Hard resets are always destructive.
      if (toolName === 'git_reset' && params && params.mode && params.mode !== 'hard') {
        // Soft reset isn't destructive, let's treat it as a write tool or command tool
      } else {
        const approved = await this.promptUser(`⚠️  [Approval Required] Destructive Tool: ${toolName} (${JSON.stringify(params)})`);
        return approved ? { approved: true } : { approved: false, reason: 'User denied permission for destructive operation.' };
      }
    }

    // 2. Write tools
    if (WRITE_TOOLS.has(toolName)) {
      if (this.mode === 'suggest') {
        const approved = await this.promptUser(`📝 [Approval Required] File/Write Tool: ${toolName} (${JSON.stringify(params)})`);
        return approved ? { approved: true } : { approved: false, reason: 'User denied permission for file write.' };
      }
      return { approved: true };
    }

    // 3. Command/Terminal tools
    if (COMMAND_TOOLS.has(toolName)) {
      if (this.mode === 'suggest' || this.mode === 'auto-edit') {
        const approved = await this.promptUser(`💻 [Approval Required] Command Tool: ${toolName} (${JSON.stringify(params)})`);
        return approved ? { approved: true } : { approved: false, reason: 'User denied permission for command execution.' };
      }
      return { approved: true };
    }

    // Default: read-only or diagnostic tools are auto-approved
    return { approved: true };
  }

  promptUser(message) {
    return new Promise((resolve) => {
      if (!this.rl) {
        // Fallback for non-interactive environments
        console.log(chalk.yellow(`\n${message} -> Auto-approved (non-interactive mode)`));
        return resolve(true);
      }

      this.rl.question(chalk.yellow(`\n${message} [Y/n]: `), (answer) => {
        const clean = answer.trim().toLowerCase();
        if (clean === '' || clean === 'y' || clean === 'yes') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }
}

module.exports = {
  ApprovalManager,
  DESTRUCTIVE_TOOLS,
  WRITE_TOOLS,
  COMMAND_TOOLS
};
