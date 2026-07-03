'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Parses simple YAML frontmatter and extracts the metadata and body.
 * @param {string} content - File content containing frontmatter.
 * @returns {object} { name, description, allowedTools: [], body }
 */
function parseSkillFrontmatter(content) {
  const result = {
    name: '',
    description: '',
    allowedTools: [],
    body: ''
  };

  if (!content) return result;

  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    result.body = trimmed;
    return result;
  }

  // Split by frontmatter separator
  const parts = trimmed.split('---');
  if (parts.length < 3) {
    result.body = trimmed;
    return result;
  }

  const yamlSection = parts[1].trim();
  result.body = parts.slice(2).join('---').trim();

  // Parse key-value lines
  const lines = yamlSection.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'name') {
      result.name = value.replace(/^['"]|['"]$/g, ''); // strip optional quotes
    } else if (key === 'description') {
      result.description = value.replace(/^['"]|['"]$/g, '');
    } else if (key === 'allowed-tools' || key === 'allowedTools') {
      // Allowed tools could be array like [tool1, tool2] or comma-separated
      let cleanVal = value.replace(/^\[|\]$/g, '').trim();
      if (cleanVal) {
        result.allowedTools = cleanVal.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      }
    }
  }

  return result;
}

/**
 * Loads a skill file from path and parses it.
 * @param {string} filePath - Absolute path to SKILL.md.
 * @returns {object} Parsed skill object.
 */
function loadSkillFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseSkillFrontmatter(content);
    return parsed;
  } catch (e) {
    console.error(`Error loading skill file ${filePath}:`, e.message);
    return null;
  }
}

/**
 * Discovers directories containing a SKILL.md file.
 * @param {string[]} roots - Array of root paths to search.
 * @returns {string[]} Array of directory paths.
 */
function discoverSkillDirs(roots) {
  const discovered = [];
  const visited = new Set();

  for (const root of roots) {
    if (!root) continue;
    try {
      const resolvedRoot = path.resolve(root);
      if (!fs.existsSync(resolvedRoot)) continue;

      const stat = fs.statSync(resolvedRoot);
      if (!stat.isDirectory()) continue;

      // Walk one or two levels deep looking for SKILL.md
      // Walk root directory itself
      const checkSkill = (dir) => {
        const skillPath = path.join(dir, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          const resolvedDir = path.resolve(dir);
          if (!visited.has(resolvedDir)) {
            visited.add(resolvedDir);
            discovered.push(resolvedDir);
          }
          return true;
        }
        return false;
      };

      // Check the root directory itself (e.g. if it is a single skill folder)
      checkSkill(resolvedRoot);

      // Check subdirectories (e.g. roots is a directory containing multiple skill folders)
      const entries = fs.readdirSync(resolvedRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          const subPath = path.join(resolvedRoot, entry.name);
          checkSkill(subPath);

          // Go one more level deep if needed
          try {
            const nestedEntries = fs.readdirSync(subPath, { withFileTypes: true });
            for (const nested of nestedEntries) {
              if (nested.isDirectory() && nested.name !== 'node_modules' && nested.name !== '.git') {
                checkSkill(path.join(subPath, nested.name));
              }
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error(`Error scanning root ${root} for skills:`, e.message);
    }
  }

  return discovered;
}

module.exports = {
  parseSkillFrontmatter,
  loadSkillFile,
  discoverSkillDirs
};
