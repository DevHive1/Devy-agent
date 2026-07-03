'use strict';
const fs = require('fs');
const path = require('path');
const { ensureDevyAgentDir } = require('../core/projectStore');

/**
 * The set_project tool: creates (if needed) and switches into a named subdirectory of the
 * base workspace, and re-points the plan, memory, chat log, and tool-output cache at that
 * subproject's own .devy-agent folder. This is what makes "every project gets its own
 * dedicated folder with its own plan/memory/chat" actually happen, instead of everything
 * new the agent builds landing in one shared workspace root.
 */
function buildProjectSwitchTools({ projectContext, planStore, memoryStore, chatLog, contextManager, skillRegistry }) {
  return {
    set_project: {
      description: 'Create (if needed) and switch into a dedicated subdirectory of the workspace for a specific project. All subsequent file/terminal/git/diagnostic tool calls target that subdirectory, and the plan, project memory, and chat log switch to that project\'s own .devy-agent folder. Call this once before scaffolding a genuinely new/separate project; skip it if you\'re continuing work on the project already in the active directory',
      params: { name: 'string (required), short kebab-case folder name, e.g. "modern-portfolio"' },
      handler: async ({ name }) => {
        if (!name || !String(name).trim()) return { error: 'Missing required "name".' };
        const safeName = String(name).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
        if (!safeName) return { error: 'That name produced an empty/invalid directory name - use letters, numbers, dashes.' };

        const newRoot = path.resolve(projectContext.baseDir, safeName);
        if (!newRoot.startsWith(path.resolve(projectContext.baseDir))) {
          return { error: 'Invalid project name (escapes the workspace).' };
        }

        fs.mkdirSync(newRoot, { recursive: true });
        projectContext.switchToSubproject(newRoot, safeName);

        const devyPaths = ensureDevyAgentDir(newRoot);
        planStore.switchTo(devyPaths.planPath);
        memoryStore.switchTo(devyPaths.memoryPath);
        chatLog.switchTo(devyPaths.chatPath);
        contextManager.setCacheDir(devyPaths.cacheDir);

        if (skillRegistry) {
          skillRegistry.addRoot(path.join(newRoot, '.devy-agent', 'skills'));
          skillRegistry.discover();
        }

        return { success: true, project: safeName, active_directory: newRoot };
      }
    }
  };
}

module.exports = { buildProjectSwitchTools };
