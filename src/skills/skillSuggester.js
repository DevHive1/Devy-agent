'use strict';
const fs = require('fs');
const path = require('path');
const { loadSkillFile } = require('./skillLoader');
const logger = require('../utils/logger');

class SkillSuggester {
  constructor({ skillRegistry, skillInstaller, webTools, llmClient }) {
    this.skillRegistry = skillRegistry;
    this.skillInstaller = skillInstaller;
    this.webTools = webTools;
    this.llmClient = llmClient;
  }

  /**
   * Suggest relevant skills from registered ones based on prompt text
   */
  async suggestSkills(userPrompt) {
    const all = this.skillRegistry.getAll();
    const suggestions = [];
    const lowerPrompt = userPrompt.toLowerCase();

    for (const skill of all) {
      let score = 0;
      const lowerName = skill.name.toLowerCase();
      const lowerDesc = skill.description.toLowerCase();

      // Simple keyword matching
      const keywords = lowerName.split('-');
      for (const kw of keywords) {
        if (kw.length > 2 && lowerPrompt.includes(kw)) score += 3;
      }

      const descWords = lowerDesc.split(/\s+/);
      for (const word of descWords) {
        if (word.length > 3 && lowerPrompt.includes(word)) score += 1;
      }

      if (score > 0) {
        suggestions.push({ skill, score });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.map(s => ({
      name: s.skill.name,
      description: s.skill.description,
      score: s.score
    }));
  }

  /**
   * Search the internet for skills and automatically download/install them
   */
  async searchAndInstallSkill(query) {
    if (!this.webTools || !this.webTools.web_search) {
      return { error: 'Web search tool is not available.' };
    }

    logger.info(`Searching the web for skill matching: "${query}"...`);
    const searchResult = await this.webTools.web_search.handler({
      query: `${query} SKILL.md devy agent skills OR coding skills github`,
      max_results: 5
    });

    if (searchResult.error) {
      return { error: `Web search failed: ${searchResult.error}` };
    }

    const results = searchResult.results || [];
    if (results.length === 0) {
      return { message: 'No matching skills found on the web.' };
    }

    // Try to find direct github URLs or skill files
    const githubUrls = results
      .map(r => r.url)
      .filter(url => url.includes('github.com'));

    if (githubUrls.length === 0) {
      return { message: 'No GitHub repositories found containing the skill.', results };
    }

    // Attempt to install from the top URL found
    const targetUrl = githubUrls[0];
    logger.info(`Attempting to install skill from repo: ${targetUrl}`);
    const installRes = await this.skillInstaller.installFromGit(targetUrl);
    return {
      message: `Searched web for "${query}". Found repository: ${targetUrl}`,
      installResult: installRes
    };
  }
}

function buildSkillSuggesterTools(suggester) {
  return {
    suggest_skills: {
      description: 'Analyze a task or request and suggest matching local skills that can handle it.',
      params: {
        task: 'string (required, the prompt or description of the work to be done)'
      },
      handler: async ({ task }) => {
        if (!task) return { error: 'Missing required parameter: "task"' };
        try {
          const suggestions = await suggester.suggestSkills(task);
          return { suggestions };
        } catch (e) {
          return { error: `Failed to suggest skills: ${e.message}` };
        }
      }
    },
    search_and_install_online_skill: {
      description: 'Search the internet for a skill matching a description or topic, and automatically install it into the platform.',
      params: {
        query: 'string (required, topic or name of the skill, e.g. "docker-deploy" or "react-testing")'
      },
      handler: async ({ query }) => {
        if (!query) return { error: 'Missing required parameter: "query"' };
        try {
          return await suggester.searchAndInstallSkill(query);
        } catch (e) {
          return { error: `Failed to search and install skill: ${e.message}` };
        }
      }
    }
  };
}

module.exports = { SkillSuggester, buildSkillSuggesterTools };
