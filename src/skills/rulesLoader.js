'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const GLOBAL_RULES_DIR = path.join(os.homedir(), '.devy-agent');

/**
 * Loads rules from global and project-scoped directories.
 * @param {string} projectDir - Active project directory.
 * @returns {string} Combined rules text.
 */
function loadRules(projectDir) {
  const ruleFiles = [
    // Global rules
    path.join(GLOBAL_RULES_DIR, 'AGENTS.md'),
    path.join(GLOBAL_RULES_DIR, 'DEVY.md'),
    // Project-specific rules (base workspace or active subproject)
    projectDir ? path.join(projectDir, '.devy-agent', 'AGENTS.md') : null,
    projectDir ? path.join(projectDir, '.devy-agent', 'DEVY.md') : null,
    // Support project root AGENTS.md / DEVY.md if present
    projectDir ? path.join(projectDir, 'AGENTS.md') : null,
    projectDir ? path.join(projectDir, 'DEVY.md') : null
  ].filter(Boolean);

  const sections = [];

  for (const file of ruleFiles) {
    try {
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file);
        if (stat.isFile()) {
          const content = fs.readFileSync(file, 'utf8').trim();
          if (content) {
            const filename = path.basename(file);
            const relativePath = projectDir ? path.relative(projectDir, file) : file;
            sections.push(`=== Rules from ${filename} (${relativePath}) ===\n${content}`);
          }
        }
      }
    } catch (e) {
      console.error(`Error reading rule file ${file}:`, e.message);
    }
  }

  return sections.join('\n\n');
}

module.exports = {
  loadRules
};
