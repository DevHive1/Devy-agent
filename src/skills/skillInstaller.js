'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadSkillFile } = require('./skillLoader');

/**
 * Install skills from multiple sources:
 * - Local directory path
 * - Git repository URL
 * - Tar/zip archive URL (via curl)
 */
class SkillInstaller {
  constructor({ skillsDir }) {
    this.skillsDir = skillsDir;
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  /**
   * Install from a local directory containing SKILL.md
   */
  installFromLocal(sourcePath) {
    if (!fs.existsSync(path.join(sourcePath, 'SKILL.md'))) {
      return { error: `No SKILL.md found in ${sourcePath}` };
    }
    const skill = loadSkillFile(path.join(sourcePath, 'SKILL.md'));
    const destDir = path.join(this.skillsDir, skill.name);
    fs.mkdirSync(destDir, { recursive: true });
    this._copyDir(sourcePath, destDir);
    return { success: true, name: skill.name, path: destDir };
  }

  /**
   * Install from a git repository URL
   */
  installFromGit(repoUrl, subdir) {
    const tmpDir = path.join(this.skillsDir, '.tmp-' + Date.now());
    try {
      execSync(`git clone --depth 1 "${repoUrl}" "${tmpDir}"`, { timeout: 60000, stdio: 'pipe' });
      const sourceDir = subdir ? path.join(tmpDir, subdir) : tmpDir;
      if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
        // Try to find SKILL.md files in subdirectories
        const found = this._findSkillDirs(tmpDir);
        if (found.length === 0) {
          this._rm(tmpDir);
          return { error: 'No SKILL.md found in repository' };
        }
        const results = [];
        for (const dir of found) {
          const res = this.installFromLocal(dir);
          if (res.success) results.push(res);
        }
        this._rm(tmpDir);
        return { success: true, installed: results };
      }
      const result = this.installFromLocal(sourceDir);
      this._rm(tmpDir);
      return result;
    } catch (e) {
      this._rm(tmpDir);
      return { error: `Git clone failed: ${e.message}` };
    }
  }

  /**
   * Install from a registry entry (JSON config)
   */
  installFromRegistry(entry) {
    if (entry.git) return this.installFromGit(entry.git, entry.subdir);
    if (entry.path) return this.installFromLocal(entry.path);
    return { error: 'Invalid registry entry. Provide "git" or "path".' };
  }

  /**
   * Batch install from a skills manifest file (JSON array)
   */
  installFromManifest(manifestPath) {
    try {
      const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!Array.isArray(entries)) return { error: 'Manifest must be a JSON array.' };
      const results = [];
      for (const entry of entries) {
        results.push(this.installFromRegistry(entry));
      }
      return { success: true, results };
    } catch (e) {
      return { error: `Failed to parse manifest: ${e.message}` };
    }
  }

  /**
   * List installed skills
   */
  listInstalled() {
    try {
      return fs.readdirSync(this.skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => {
          const skillFile = path.join(this.skillsDir, e.name, 'SKILL.md');
          if (!fs.existsSync(skillFile)) return null;
          try {
            const skill = loadSkillFile(skillFile);
            return { name: skill.name, description: skill.description, path: path.join(this.skillsDir, e.name) };
          } catch (_) { return { name: e.name, description: '(parse error)', path: path.join(this.skillsDir, e.name) }; }
        }).filter(Boolean);
    } catch (_) { return []; }
  }

  /**
   * Uninstall a skill by name
   */
  uninstall(name) {
    const dir = path.join(this.skillsDir, name);
    if (!fs.existsSync(dir)) return { error: `Skill "${name}" not found.` };
    this._rm(dir);
    return { success: true, name };
  }

  _findSkillDirs(root) {
    const results = [];
    function walk(dir, depth) {
      if (depth > 3) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        if (entries.some(e => e.name === 'SKILL.md' && e.isFile())) results.push(dir);
        for (const e of entries) {
          if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') walk(path.join(dir, e.name), depth + 1);
        }
      } catch (_) {}
    }
    walk(root, 0);
    return results;
  }

  _copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.name === '.git') continue;
      if (e.isDirectory()) this._copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  _rm(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

function buildSkillInstallerTools(installer) {
  return {
    install_skill: {
      description: 'Install a skill from a local path or git repository URL. Skills are directories containing a SKILL.md file.',
      params: { source: 'string (required, local path or git URL)', subdir: 'string (optional, subdirectory within git repo)' },
      handler: async ({ source, subdir }) => {
        if (!source) return { error: 'Missing required: "source"' };
        if (source.includes('://') || source.endsWith('.git')) return installer.installFromGit(source, subdir);
        return installer.installFromLocal(path.resolve(source));
      }
    },
    uninstall_skill: {
      description: 'Remove an installed skill by name.',
      params: { name: 'string (required)' },
      handler: async ({ name }) => {
        if (!name) return { error: 'Missing required: "name"' };
        return installer.uninstall(name);
      }
    },
    list_installed_skills: {
      description: 'List all installed skills with their descriptions and paths.',
      params: {},
      handler: async () => ({ skills: installer.listInstalled() })
    }
  };
}

module.exports = { SkillInstaller, buildSkillInstallerTools };
