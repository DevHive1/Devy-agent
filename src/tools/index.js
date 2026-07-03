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
 * Builds every tool available to the agent, plus the shared state (project context,
 * persistent plan/memory/chat log stores, think log) so the orchestrator can inject their
 * compact summaries into the prompt each step. Also ensures the base workspace's
 * ".devy-agent" data folder exists; set_project later re-points plan/memory/chat/cache at a
 * subproject's own .devy-agent folder without needing to rebuild any of this.
 */
function buildToolRegistry(config, contextManager, devyPaths, llmClient) {
  const projectContext = new ProjectContext(config.workspaceDir);

  const planStore = new PlanStore(devyPaths.planPath);
  const memoryStore = new MemoryStore(devyPaths.memoryPath);
  const chatLog = new SessionLog(devyPaths.chatPath);
  const thinkLog = [];

  // Initialize skills roots
  const globalSkillsDir = path.join(os.homedir(), '.devy-agent', 'skills');
  const projectSkillsDir = path.join(projectContext.dir, '.devy-agent', 'skills');
  const systemSkillsDir = path.resolve(__dirname, '../../skills');
  const skillRegistry = new SkillRegistry([globalSkillsDir, projectSkillsDir, systemSkillsDir]);
  skillRegistry.discover();

  // Skill installer for multi-source skill management
  const skillInstaller = new SkillInstaller({ skillsDir: projectSkillsDir });

  // Professional plan manager
  const planManager = new PlanManager({ planDir: path.join(devyPaths.devyDir, 'plans') });

  // Vector store for semantic search
  const vectorStore = new VectorStore({ persistPath: path.join(devyPaths.cacheDir, 'vectors.json') });
  vectorStore.load();

  // Background task manager
  const backgroundTaskManager = new BackgroundTaskManager({ logDir: path.join(devyPaths.devyDir, 'tasks') });

  // Web tools instance
  const webTools = buildWebTools();

  // Skill suggester
  const skillSuggester = new SkillSuggester({ skillRegistry, skillInstaller, webTools, llmClient });

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
    subagentManager = new SubagentManager({
      llmClient,
      tools: {}, // will be assigned below
      systemPrompt,
      contextLength: config.ollama.contextLength,
      compressionThreshold: config.compressionThreshold,
      toolOutputMaxChars: config.toolOutputMaxChars,
      cacheDir: devyPaths.cacheDir
    });
    subagentTools = buildSubagentTools(subagentManager);
  }

  const tools = {
    ...buildFileTools(projectContext),
    ...buildTerminalTools(projectContext),
    ...buildGitTools(projectContext),
    ...buildProjectManagementTools(projectContext),
    ...buildGithubTools(config.github),
    ...buildGithubActionsTools(config.github),
    ...buildPlanTools(planStore),
    ...buildMemoryTools(memoryStore),
    ...buildThinkTools(thinkLog),
    ...buildProjectSwitchTools({ projectContext, planStore, memoryStore, chatLog, contextManager, skillRegistry }),
    ...buildSkillTools(skillRegistry, skillExecutor, projectContext),
    ...webTools,
    ...buildAdvancedFileTools(projectContext),
    ...buildSemanticSearchTools(projectContext, llmClient, vectorStore),
    ...buildPlanManagerTools(planManager),
    ...buildSkillInstallerTools(skillInstaller),
    ...buildSkillSuggesterTools(skillSuggester),
    ...buildBackgroundTools(backgroundTaskManager),
    ...subagentTools
  };

  if (subagentManager) {
    const subagentToolsRegistry = { ...tools };
    delete subagentToolsRegistry.spawn_subagent;
    delete subagentToolsRegistry.wait_subagents;
    subagentManager.tools = subagentToolsRegistry;
  }

  return { tools, planStore, memoryStore, chatLog, thinkLog, projectContext, skillRegistry, planManager, skillInstaller, vectorStore, backgroundTaskManager, skillSuggester };
}

const CATEGORIES = [
  { label: 'Files (read/write/edit)', match: (n) => ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_code'].includes(n) },
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
  { label: 'Subagents', match: (n) => ['spawn_subagent', 'wait_subagents'].includes(n) },
  { label: 'Web', match: (n) => ['web_search', 'read_url'].includes(n) },
  { label: 'Reasoning', match: (n) => n === 'think' }
];

/** Compact, categorized tool listing injected into the system prompt - name + one-line description each */
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

module.exports = { buildToolRegistry, describeToolsCompact };
