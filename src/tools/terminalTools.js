'use strict';
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function buildTerminalTools(projectContext) {
  return {
    execute_command: {
      description: 'Run a shell command inside the active project (or a subdirectory of it). Use this for things with no dedicated tool: installing dependencies, running dev servers/build tools, invoking linters/formatters/language toolchains, etc. Do NOT use this to write or edit file content (use write_file/edit_file instead) unless those tools genuinely fail.',
      params: { command: 'string (required)', cwd: 'string (optional, relative to the active project)', timeout_ms: 'number (optional, default 60000)' },
      handler: async ({ command, cwd, timeout_ms = 60000 }) => {
        const Sandbox = require('../core/sandbox');
        const sandbox = new Sandbox({ projectDir: projectContext.dir });

        const validation = sandbox.validateCommand(command);
        if (!validation.allowed) {
          return { error: `Security block: ${validation.reason}` };
        }

        const execCwd = path.resolve(projectContext.dir, cwd || '.');
        if (!sandbox.isPathWithinProject(execCwd)) {
          return { error: 'Security block: Path is outside the active project root directory.' };
        }

        if (!fs.existsSync(execCwd)) {
          return { error: `Directory not found: ${cwd || '.'}` };
        }
        return new Promise((resolve) => {
          exec(command, { cwd: execCwd, timeout: timeout_ms, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && err.killed) {
              return resolve({ error: `Command timed out after ${timeout_ms}ms`, stdout, stderr });
            }
            resolve({
              exit_code: err ? (err.code ?? 1) : 0,
              stdout: stdout?.toString() || '',
              stderr: stderr?.toString() || ''
            });
          });
        });
      }
    }
  };
}

module.exports = { buildTerminalTools };
