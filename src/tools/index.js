'use strict';
const { buildFileTools } = require('./fileTools');
const { buildTerminalTools } = require('./terminalTools');
const { buildGitTools } = require('./gitTools');
const { buildGithubTools } = require('./githubTools');
const { buildGithubActionsTools } = require('./githubActionsTools');
const { buildPlanTools, PlanStore } = require('./planTools');
const { buildMemoryTools, MemoryStore } = require('./memoryTools');
const { buildThinkTools } = require('./thinkTools');
const { buildProjectManagementTools } = require('./projectManagementTools');
const { buildProjectSwitchTools } = require('./projectSwitchTools');
const { buildSkillTools } = require('./skillTools');
const { buildWebTools } = require('./webTools');
const { buildAdvancedFileTools } = require('./advancedFileTools');
const { buildSemanticSearchTools } = require('./semanticSearchTools');
const SkillRegistry = require('../skills/skillRegistry');
const skillExecutor = require('../skills/skillExecutor');
const { SkillInstaller, buildSkillInstallerTools } = require('../skills/skillInstaller');
const { SkillSuggester, buildSkillSuggesterTools } = require('../skills/skillSuggester');
const { BackgroundTaskManager } = require('../utils/backgroundTaskManager');
const { buildBackgroundTools } = require('./backgroundTools');
const { PlanManager, buildPlanManagerTools } = require('../core/planManager');
const { VectorStore } = require('../utils/vectorStore');
const { ProjectContext } = require('../core/projectContext');
const { SessionLog } = require('../core/sessionLog');
const os = require('os');
const path = require('path');

/**
 * Initializes the core state stores for the agent session.
 */
function createStateStore(config, devyPaths) {
  const projectContext = new ProjectContext(config.workspaceDir);
  return {
    projectContext,
    planStore: new PlanStore(devyPaths.planPath),
    memoryStore: new MemoryStore(devyPaths.memoryPath),
    chatLog: new SessionLog(devyPaths.chatPath),
    thinkLog: []
  };
}

/**
 * Initializes the skill discovery and management system.
 */
function createSkillSystem(projectContext, llmClient) {
  const globalSkillsDir = path.join(os.homedir(), '.devy-agent', 'skills');
  const projectSkillsDir = path.join(projectContext.dir, '.devy-agent', 'skills');
  const systemSkillsDir = path.resolve(__dirname, '../../skills');
  
  const skillRegistry = new SkillRegistry([globalSkillsDir, projectSkillsDir, systemSkillsDir]);
  skillRegistry.discover();

  const skillInstaller = new SkillInstaller({ skillsDir: projectSkillsDir });
  const webTools = buildWebTools();
  const skillSuggester = new SkillSuggester({ skillRegistry, skillInstaller, webTools, llmClient });

  return { skillRegistry, skillInstaller, skillSuggester, webTools };
}

/**
 * Initializes the heavy infrastructure components.
 */
function createInfrastructure(devyPaths) {
  const vectorStore = new VectorStore({ persistPath: path.join(devyPaths.cacheDir, 'vectors.json') });
  vectorStore.load();

  const backgroundTaskManager = new BackgroundTaskManager({ logDir: path.join(devyPaths.devyDir, 'tasks') });

  return { vectorStore, backgroundTaskManager };
}

/**
 * Builds every tool available to the agent, coordinating the state, skill, and infra factories.
 */
function buildToolRegistry(config, contextManager, devyPaths, llmClient) {
  const state = createStateStore(config, devyPaths);
  const skills = createSkillSystem(state.projectContext, llmClient);
  const infra = createInfrastructure(devyPaths);

  const planManager = new PlanManager({ planDir: path.join(devyPaths.devyDir, 'plans') });

  let subagentTools = {};
  let subagentManager = null;
  if (llmClient) {
    const { SubagentManager, buildSubagentTools } = require('../core/subagentManager');
    const systemPrompt = require('../core/promptBuilder').buildSystemPrompt({
      toolsDescription: '',
      workspaceDir: config.workspaceDir,
      githubDefaults: config.github,
      memoryPreview: ''
    });
    subagentManager = new SubagentManager(llmClient, systemPrompt);
    subagentTools = buildSubagentTools(subagentManager);
  }

  const tools = {
    ...buildFileTools(state.projectContext),
    ...buildTerminalTools(state.projectContext),
    ...buildGitTools(state.projectContext),
    ...buildGithubTools(config.github),
    ...buildGithubActionsTools(config.github),
    ...buildPlanTools(state.planStore),
    ...buildMemoryTools(state.memoryStore),
    ...buildThinkTools(state.thinkLog),
    ...buildProjectManagementTools(state.projectContext),
    ...buildProjectSwitchTools({
      projectContext: state.projectContext,
      planStore: state.planStore,
      memoryStore: state.memoryStore,
      chatLog: state.chatLog,
      contextManager,
      skillRegistry: skills.skillRegistry
    }),
    ...buildSkillTools(skills.skillRegistry, skills.skillExecutor, state.projectContext),
    ...buildWebTools(),
    ...buildAdvancedFileTools(state.projectContext),
    ...buildSemanticSearchTools(state.projectContext, llmClient, infra.vectorStore),
    ...buildBackgroundTools(infra.backgroundTaskManager),
    ...buildPlanManagerTools(planManager),
    ...buildSkillInstallerTools(skills.skillInstaller),
    ...buildSkillSuggesterTools(skills.skillSuggester),
    ...subagentTools
  };

  const container = require('../utils/container');
  
  container.register('planStore', state.planStore);
  container.register('memoryStore', state.memoryStore);
  container.register('chatLog', state.chatLog);
  container.register('thinkLog', state.thinkLog);
  container.register('projectContext', state.projectContext);
  container.register('skillRegistry', skills.skillRegistry);
  container.register('planManager', planManager);
  container.register('skillInstaller', skills.skillInstaller);
  container.register('vectorStore', infra.vectorStore);
  container.register('backgroundTaskManager', infra.backgroundTaskManager);
  container.register('skillSuggester', skills.skillSuggester);

  return {
    tools,
    container
  };
}

/**
 * Returns a compact description of all tools.
 */
function describeToolsCompact(tools) {
  const descriptions = [];
  for (const [name, tool] of Object.entries(tools)) {
    descriptions.push(`${name}: ${tool.description || 'No description'}`);
  }
  return descriptions.join('\n');
}

module.exports = {
  buildToolRegistry,
  describeToolsCompact
};