'use strict';
const path = require('path');
const { discoverSkillDirs, loadSkillFile } = require('./skillLoader');
const eventBus = require('../core/eventBus');

class SkillRegistry {
  constructor(roots = []) {
    this.roots = roots;
    this.skills = {}; // name -> SkillEntry
  }

  addRoot(root) {
    if (root && !this.roots.includes(root)) {
      this.roots.push(root);
    }
  }

  discover() {
    this.skills = {};
    const skillDirs = discoverSkillDirs(this.roots);

    for (const dir of skillDirs) {
      const filePath = path.join(dir, 'SKILL.md');
      const meta = loadSkillFile(filePath);
      if (meta && meta.name) {
        const name = meta.name.toLowerCase();
        this.skills[name] = {
          name: meta.name,
          description: meta.description,
          allowedTools: meta.allowedTools,
          dir: dir,
          filePath: filePath,
          // Store raw content/body for lazy loading
          loaded: false
        };
      }
    }
    return this.getAll().length;
  }

  getAll() {
    return Object.values(this.skills);
  }

  getByName(name) {
    if (!name) return null;
    return this.skills[name.toLowerCase()] || null;
  }

  matchSkill(query) {
    if (!query) return null;
    const cleanQuery = query.toLowerCase();
    const allSkills = this.getAll();

    // 1. Exact match
    const exact = this.getByName(cleanQuery);
    if (exact) return exact;

    // 2. Word matching in name/description
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return null;

    let bestMatch = null;
    let maxMatches = 0;

    for (const skill of allSkills) {
      let matches = 0;
      const targetText = `${skill.name} ${skill.description}`.toLowerCase();
      
      for (const word of queryWords) {
        if (targetText.includes(word)) {
          matches++;
        }
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = skill;
      }
    }

    return maxMatches > 0 ? bestMatch : null;
  }

  loadBody(entry) {
    if (!entry) return '';
    eventBus.emit('skill:load', { name: entry.name });
    
    // Always read from file to ensure we get the latest if edited
    const parsed = loadSkillFile(entry.filePath);
    if (parsed) {
      entry.body = parsed.body;
      entry.loaded = true;
      return parsed.body;
    }
    return '';
  }

  describeCompact() {
    const list = this.getAll();
    if (list.length === 0) {
      return '';
    }

    const lines = ['=== Available Skills (progressive disclosure - use_skill to load full instructions) ==='];
    list.forEach(skill => {
      lines.push(`- Skill name: ${skill.name}`);
      lines.push(`  Description: ${skill.description}`);
      if (skill.allowedTools && skill.allowedTools.length > 0) {
        lines.push(`  Allowed Tools: ${skill.allowedTools.join(', ')}`);
      }
    });

    return lines.join('\n');
  }
}

module.exports = SkillRegistry;
