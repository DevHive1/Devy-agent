'use strict';
const fs = require('fs');
const path = require('path');

function buildSkillTools(skillRegistry, skillExecutor, projectContext) {
  return {
    list_skills: {
      description: 'List all available skills (modular task workflows) with their name, description, and allowed tools.',
      params: {},
      handler: async () => {
        try {
          return { skills: skillRegistry.getAll() };
        } catch (e) {
          return { error: `Failed to list skills: ${e.message}` };
        }
      }
    },

    use_skill: {
      description: 'Load and inspect the full step-by-step instructions for a specific skill by name (progressive disclosure). Use this when you need specialized expertise or a guided workflow for a specific task.',
      params: { name: 'string (required, the name of the skill to use)' },
      handler: async ({ name }) => {
        try {
          if (!name) return { error: 'Missing required parameter: "name"' };
          const entry = skillRegistry.getByName(name);
          if (!entry) {
            const available = skillRegistry.getAll().map(s => s.name).join(', ') || 'none';
            return { error: `Skill "${name}" not found. Available skills: ${available}` };
          }
          const body = skillRegistry.loadBody(entry);
          return {
            name: entry.name,
            description: entry.description,
            allowedTools: entry.allowedTools || [],
            instructions: body
          };
        } catch (e) {
          return { error: `Failed to use skill ${name}: ${e.message}` };
        }
      }
    },

    create_skill: {
      description: 'Create a new skill (reusable workflow) and persist it to the active project\'s .devy-agent/skills directory. Useful for saving successful patterns or procedures so they can be reused.',
      params: {
        name: 'string (required, short kebab-case name, e.g. "deploy-to-vercel")',
        description: 'string (required, clear summary of what the skill does)',
        instructions: 'string (required, markdown step-by-step instructions the agent should follow)',
        allowed_tools: 'array of strings (optional, list of tools this skill is allowed to use)'
      },
      handler: async ({ name, description, instructions, allowed_tools }) => {
        try {
          if (!name) return { error: 'Missing required parameter: "name"' };
          if (!description) return { error: 'Missing required parameter: "description"' };
          if (!instructions) return { error: 'Missing required parameter: "instructions"' };

          const safeName = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
          if (!safeName) return { error: 'Invalid name. Use letters, numbers, and dashes.' };

          // Build skill directory path under active project's .devy-agent/skills
          const skillDir = path.join(projectContext.dir, '.devy-agent', 'skills', safeName);
          fs.mkdirSync(skillDir, { recursive: true });

          const yamlTools = allowed_tools 
            ? (Array.isArray(allowed_tools) ? allowed_tools.join(', ') : allowed_tools) 
            : '';

          const content = `---
name: ${safeName}
description: "${description.replace(/"/g, '\\"')}"
allowed-tools: [${yamlTools}]
---

# ${name.trim()}

${instructions.trim()}
`;

          const skillFilePath = path.join(skillDir, 'SKILL.md');
          fs.writeFileSync(skillFilePath, content, 'utf8');

          // Trigger rediscovery
          skillRegistry.discover();

          return {
            success: true,
            name: safeName,
            filePath: path.relative(projectContext.dir, skillFilePath)
          };
        } catch (e) {
          return { error: `Failed to create skill: ${e.message}` };
        }
      }
    }
  };
}

module.exports = { buildSkillTools };
