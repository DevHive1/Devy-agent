'use strict';
const fs = require('fs');
const path = require('path');

const DEVY_DIR_NAME = '.devy-agent';

/**
 * Ensures the per-project ".devy-agent" data folder exists inside the current workspace,
 * with subfolders for the plan, persistent memory, and truncated tool-output cache.
 * Also makes sure the folder is excluded from the user's own project git history by
 * adding it to workspace/.gitignore (created if missing, when the workspace is a git repo).
 */
function ensureDevyAgentDir(workspaceDir) {
  const devyDir = path.join(workspaceDir, DEVY_DIR_NAME);
  const cacheDir = path.join(devyDir, 'cache');
  const planPath = path.join(devyDir, 'plan.json');
  const memoryPath = path.join(devyDir, 'memory.md');
  const chatPath = path.join(devyDir, 'chat.md');

  fs.mkdirSync(devyDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  try {
    const gitignorePath = path.join(workspaceDir, '.gitignore');
    const entry = `${DEVY_DIR_NAME}/`;
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const alreadyThere = content.split('\n').some((l) => l.trim() === entry || l.trim() === DEVY_DIR_NAME);
      if (!alreadyThere) {
        fs.appendFileSync(gitignorePath, `\n# Devy Agent local data (plan, memory, chat log, cache)\n${entry}\n`);
      }
    } else if (fs.existsSync(path.join(workspaceDir, '.git'))) {
      fs.writeFileSync(gitignorePath, `# Devy Agent local data (plan, memory, chat log, cache)\n${entry}\n`);
    }
  } catch (_) {
    // Non-fatal: worst case the folder just isn't gitignored automatically.
  }

  return { devyDir, cacheDir, planPath, memoryPath, chatPath };
}

module.exports = { ensureDevyAgentDir, DEVY_DIR_NAME };
