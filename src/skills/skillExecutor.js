'use strict';
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Lists all executable scripts inside a skill's scripts/ directory.
 * @param {string} skillDir - Absolute path to skill directory.
 * @returns {string[]} Array of script filenames or relative paths.
 */
function listSkillScripts(skillDir) {
  try {
    const scriptsDir = path.join(skillDir, 'scripts');
    if (!fs.existsSync(scriptsDir)) return [];
    
    const stat = fs.statSync(scriptsDir);
    if (!stat.isDirectory()) return [];

    return fs.readdirSync(scriptsDir)
      .filter(file => {
        const ext = path.extname(file);
        return ['.js', '.sh', '.py', '.bash'].includes(ext);
      });
  } catch (e) {
    console.error(`Error listing scripts in ${skillDir}:`, e.message);
    return [];
  }
}

/**
 * Executes a skill script.
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @param {string} cwd - Directory to execute the script in.
 * @returns {Promise<object>} Promise resolving to { exit_code, stdout, stderr }
 */
function executeSkillScript(scriptPath, cwd) {
  return new Promise((resolve) => {
    if (!fs.existsSync(scriptPath)) {
      return resolve({
        exit_code: 127,
        stdout: '',
        stderr: `Script file not found: ${scriptPath}`
      });
    }

    const ext = path.extname(scriptPath);
    let command = '';

    if (ext === '.js') {
      command = `node "${scriptPath}"`;
    } else if (ext === '.sh' || ext === '.bash') {
      command = `bash "${scriptPath}"`;
    } else if (ext === '.py') {
      command = `python "${scriptPath}"`;
    } else {
      // Direct execution fallback
      command = `"${scriptPath}"`;
    }

    exec(command, { cwd, timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.killed) {
        return resolve({
          exit_code: 124,
          stdout: stdout?.toString() || '',
          stderr: `Script timed out after 60 seconds. ${stderr?.toString() || ''}`
        });
      }
      
      resolve({
        exit_code: err ? (err.code ?? 1) : 0,
        stdout: stdout?.toString() || '',
        stderr: stderr?.toString() || ''
      });
    });
  });
}

module.exports = {
  listSkillScripts,
  executeSkillScript
};
