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
const { GraphPlanManager, buildGraphPlanManagerTools } = require('../core/graphPlanManager');
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
  const graphPlanManager = new GraphPlanManager({ planDir: path.join(devyPaths.devyDir, 'graph-plans') });

  let subagentTools = {};
  let subagentManager = null;
  if (llmClient) {
    const { SubagentManager, buildSubagentTools } = require('../core/subagentManager');
    const systemPrompt = require('../core/promptBuilder').buildSystemPrompt({
      toolsDescription: '',
      workspaceDir: config.workspaceDir,
      githubDefaults: config.github,
      memoryPreview: '',
      modelName: llmClient.modelName || llmClient.model
    });
    subagentManager = new SubagentManager({
      llmClient,
      tools: {}, // populated below
      systemPrompt,
      contextLength: config.ollama.contextLength || 8192,
      compressionThreshold: config.compressionThreshold || 0.65,
      toolOutputMaxChars: config.toolOutputMaxChars || 4000,
      cacheDir: devyPaths.cacheDir
    });
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
    ...buildSkillTools(skills.skillRegistry, skillExecutor, state.projectContext),
    ...buildWebTools(),
    ...buildAdvancedFileTools(state.projectContext),
    ...buildSemanticSearchTools(state.projectContext, llmClient, infra.vectorStore),
    ...buildBackgroundTools(infra.backgroundTaskManager),
    ...buildPlanManagerTools(planManager),
    ...buildGraphPlanManagerTools(graphPlanManager),
    ...buildSkillInstallerTools(skills.skillInstaller),
    ...buildSkillSuggesterTools(skills.skillSuggester),
    ...subagentTools
  };

  if (subagentManager) {
    const subagentToolsRegistry = { ...tools };
    delete subagentToolsRegistry.spawn_subagent;
    delete subagentToolsRegistry.spawn_subagents_parallel;
    delete subagentToolsRegistry.wait_subagents;
    subagentManager.tools = subagentToolsRegistry;
  }

  const container = require('../utils/container');
  
  container.register('planStore', state.planStore);
  container.register('memoryStore', state.memoryStore);
  container.register('chatLog', state.chatLog);
  container.register('thinkLog', state.thinkLog);
  container.register('projectContext', state.projectContext);
  container.register('skillRegistry', skills.skillRegistry);
  container.register('planManager', planManager);
  container.register('graphPlanManager', graphPlanManager);
  container.register('skillInstaller', skills.skillInstaller);
  container.register('vectorStore', infra.vectorStore);
  container.register('backgroundTaskManager', infra.backgroundTaskManager);
  container.register('skillSuggester', skills.skillSuggester);

  return {
    tools,
    container
  };
}

const CATEGORIES = [
  { label: 'Files (read/write/edit)', match: (n) => ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_code', 'get_file_outline', 'pin_file', 'unpin_file'].includes(n) },
  { label: 'Project management', match: (n) => ['make_dir', 'move_path', 'copy_path', 'delete_path', 'find_files', 'read_many_files', 'file_info'].includes(n) },
  { label: 'Advanced files', match: (n) => ['multi_edit_file', 'replace_in_files', 'compare_files', 'tree_view', 'count_lines', 'lint_check'].includes(n) },
  { label: 'Diagnostics', match: (n) => ['detect_project', 'run_tests', 'check_tool_installed'].includes(n) },
  { label: 'Terminal', match: (n) => n === 'execute_command' },
  { label: 'Git (local)', match: (n) => n.startsWith('git_') },
  { label: 'GitHub Actions', match: (n) => n.startsWith('gh_actions_') },
  { label: 'GitHub (remote, no clone needed)', match: (n) => n.startsWith('gh_') && !n.startsWith('gh_actions_') },
  { label: 'Planning', match: (n) => ['create_plan', 'update_task', 'add_task', 'get_plan'].includes(n) },
  { label: 'Advanced planning', match: (n) => ['create_advanced_plan', 'get_advanced_plan', 'list_plans', 'update_plan_task', 'add_plan_phase'].includes(n) },
  { label: 'Project memory', match: (n) => n.startsWith('memory_') },
  { label: 'Project switching', match: (n) => n === 'set_project' },
  { label: 'Skills', match: (n) => ['list_skills', 'use_skill', 'create_skill', 'suggest_skills'].includes(n) },
  { label: 'Skill management', match: (n) => ['install_skill', 'uninstall_skill', 'list_installed_skills', 'search_and_install_online_skill'].includes(n) },
  { label: 'Background tasks', match: (n) => n.includes('_background_command') || n === 'list_background_commands' },
  { label: 'Semantic search', match: (n) => ['semantic_search', 'index_project'].includes(n) },
  { label: 'Subagents', match: (n) => ['spawn_subagent', 'wait_subagents', 'spawn_subagents_parallel'].includes(n) },
  { label: 'Web', match: (n) => ['web_search', 'read_url'].includes(n) },
  { label: 'Reasoning', match: (n) => n === 'think' }
];

/**
 * Returns a compact description of all tools.
 */
function describeToolsCompact(tools) {
  const entries = Object.entries(tools);
  const used = new Set();
  const lines = [];

  for (const cat of CATEGORIES) {
    const items = entries.filter(([name]) => cat.match(name) && !used.has(name));
    if (!items.length) continue;
    lines.push(`\n[${cat.label}]`);
    items.forEach(([name, def]) => {
      used.add(name);
      lines.push(`- ${name}: ${def.description}`);
    });
  }

  const rest = entries.filter(([name]) => !used.has(name));
  if (rest.length) {
    lines.push('\n[Other]');
    rest.forEach(([name, def]) => lines.push(`- ${name}: ${def.description}`));
  }

  return lines.join('\n').trim();
}

module.exports = {
  buildToolRegistry,
  describeToolsCompact
};