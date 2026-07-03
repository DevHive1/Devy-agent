#!/usr/bin/env node
'use strict';
const readline = require('readline');
const path = require('path');
const chalk = require('chalk');
const boxen = require('boxen');
const { resolveConfig, listOllamaModels, savePersistedConfig, loadPersistedConfig, GLOBAL_ENV_FILE } = require('../src/config');
const OllamaClient = require('../src/llm/ollama');
const { buildToolRegistry, describeToolsCompact } = require('../src/tools');
const { buildSystemPrompt } = require('../src/core/promptBuilder');
const { ContextManager } = require('../src/core/contextManager');
const { Orchestrator } = require('../src/core/orchestrator');
const { ensureDevyAgentDir, DEVY_DIR_NAME } = require('../src/core/projectStore');
const logger = require('../src/utils/logger');
const { loadRules } = require('../src/skills/rulesLoader');
const { connectAndRegisterMCP } = require('../src/mcp/mcpConfig');
const { ApprovalManager } = require('../src/core/approvalManager');

const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show this list of commands' },
  { cmd: '/models', desc: 'List models installed in Ollama' },
  { cmd: '/model <name>', desc: 'Switch the active model for this session' },
  { cmd: '/plan', desc: 'Show the current plan and task status' },
  { cmd: '/task', desc: 'Manage tasks - see "/task" with no args for usage' },
  { cmd: '/memory', desc: 'Show the active project\'s persistent memory (.devy-agent/memory.md)' },
  { cmd: '/project', desc: 'Show which project directory is currently active' },
  { cmd: '/approvals [mode]', desc: 'Show or set the tool execution approval mode (suggest/auto-edit/full-auto)' },
  { cmd: '/skills', desc: 'List all available skills (modular task workflows)' },
  { cmd: '/skill <name>', desc: 'Show the detailed instructions for a specific skill' },
  { cmd: '/clear', desc: 'Clear the active conversation (plan and memory are kept)' },
  { cmd: 'Ctrl+C', desc: 'Stop the agent mid-task; press again at an idle prompt to quit' },
  { cmd: 'exit / quit', desc: 'Leave the chat' }
];

// A paste of multi-line text delivers many readline "line" events in a tight burst
// (sub-millisecond apart). Buffering with a short quiet-period flush merges those into a
// single input instead of firing one task per pasted line.
const PASTE_FLUSH_MS = 60;

function parseCliArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') args.model = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--workspace') args.workspace = argv[++i];
    else args._.push(a);
  }
  return args;
}

function printBanner(config) {
  console.log(boxen(
    chalk.bold.cyan('🤖 Devy Agent') + chalk.gray('  —  Git & GitHub CLI agent') + '\n' +
    chalk.gray(`Model: ${config.ollama.model}  |  Ollama: ${config.ollama.host}`) + '\n' +
    chalk.gray(`Workspace: ${config.workspaceDir}`) + '\n' +
    chalk.gray(`GitHub: ${config.github.token ? 'connected ✅' : 'no token set (GitHub tools disabled) ⚠️'}`),
    { padding: 1, borderColor: 'cyan', borderStyle: 'round' }
  ));
  if (!config.github.token) {
    logger.info(`Tip: running as a global command? Put GITHUB_TOKEN and other settings in ${GLOBAL_ENV_FILE} to use them from any directory, instead of a .env per project.`);
  }
  console.log(chalk.gray(`Type a request, or a command (${chalk.bold('/help')} for the list):\n`));
}

function printHelp() {
  console.log(chalk.bold('\nCommands:'));
  SLASH_COMMANDS.forEach((c) => console.log(`  ${chalk.cyanBright(c.cmd.padEnd(16))} ${chalk.gray(c.desc)}`));
  console.log(chalk.gray('\n/task usage:'));
  console.log(chalk.gray('  /task                        list all tasks in the current plan'));
  console.log(chalk.gray('  /task add <title>            add a new task'));
  console.log(chalk.gray('  /task done <id>              mark a task done'));
  console.log(chalk.gray('  /task <id> <status> [note]   set a task\'s status (pending/in_progress/done/failed)'));
  console.log();
}

const STATUS_ICON = { pending: '⏳', in_progress: '🔄', done: '✅', failed: '❌' };

function printPlan(summary) {
  if (!summary.goal) {
    console.log(chalk.gray('\nNo active plan yet. It will appear once the agent calls create_plan.\n'));
    return;
  }
  console.log(chalk.bold(`\nGoal: `) + summary.goal + chalk.gray(`  (${summary.progress} done)`));
  summary.tasks.forEach((t) => {
    const icon = STATUS_ICON[t.status] || '•';
    console.log(`  ${icon} #${t.id} ${t.title}${t.note ? chalk.gray('  — ' + t.note) : ''}`);
  });
  console.log();
}

function handleTaskCommand(rest, planStore) {
  if (rest.length === 0) {
    printPlan(planStore.summary());
    return;
  }
  const sub = rest[0];
  if (sub === 'add') {
    const title = rest.slice(1).join(' ');
    if (!title) { logger.warn('Usage: /task add <title>'); return; }
    printPlan(planStore.addTask(title));
    return;
  }
  if (sub === 'done') {
    const id = rest[1];
    if (!id) { logger.warn('Usage: /task done <id>'); return; }
    printPlan(planStore.updateTask(id, 'done'));
    return;
  }
  const id = sub;
  const status = rest[1];
  const note = rest.slice(2).join(' ');
  if (!status) {
    logger.warn('Usage: /task <id> <status> [note]  |  /task add <title>  |  /task done <id>');
    return;
  }
  printPlan(planStore.updateTask(id, status, note || undefined));
}

async function handleSlashCommand(text, ctx) {
  const [command, ...rest] = text.slice(1).split(/\s+/);
  const argStr = rest.join(' ').trim();

  switch (command) {
    case 'help':
      printHelp();
      return;

    case 'models': {
      let models;
      try {
        models = await listOllamaModels(ctx.config.ollama.host);
      } catch (e) {
        logger.error(e.message);
        return;
      }
      console.log(chalk.bold('\nModels available in Ollama:'));
      models.forEach((m) => console.log(`  ${m === ctx.config.ollama.model ? chalk.green('●') : ' '} ${m}`));
      console.log();
      return;
    }

    case 'model': {
      if (!argStr) { logger.warn('Usage: /model <model-name>  (see /models for the list)'); return; }
      let models;
      try {
        models = await listOllamaModels(ctx.config.ollama.host);
      } catch (e) {
        logger.error(e.message);
        return;
      }
      const match = models.find((m) => m === argStr) || models.find((m) => m.startsWith(argStr));
      if (!match) {
        logger.error(`Model "${argStr}" not found. Run /models to see what's installed.`);
        return;
      }
      ctx.config.ollama.model = match;
      ctx.llmClient.model = match;
      savePersistedConfig({ ...loadPersistedConfig(), ollamaHost: ctx.config.ollama.host, ollamaModel: match });
      logger.info(`Switched active model to: ${match}`);
      return;
    }

    case 'plan':
      printPlan(ctx.planStore.summary());
      return;

    case 'task':
      handleTaskCommand(rest, ctx.planStore);
      return;

    case 'memory':
      console.log(chalk.gray('\n' + ctx.memoryStore.read().trim() + '\n'));
      return;

    case 'project': {
      const name = ctx.projectContext.projectName;
      console.log(chalk.gray(`\nActive project directory: ${ctx.projectContext.dir}`));
      console.log(chalk.gray(name ? `(subproject: ${name})` : '(base workspace - no subproject selected)'));
      console.log();
      return;
    }

    case 'clear':
      ctx.contextManager.reset();
      logger.info('Conversation cleared. Plan and project memory were kept.');
      return;

    case 'skills': {
      const skills = ctx.skillRegistry.getAll();
      if (skills.length === 0) {
        console.log(chalk.gray('\nNo skills registered. Add skills to ~/.devy-agent/skills/ or .devy-agent/skills/\n'));
      } else {
        console.log(chalk.bold('\nAvailable Skills:'));
        skills.forEach(s => {
          console.log(`  ${chalk.cyan(s.name.padEnd(20))} ${chalk.gray(s.description)}`);
        });
        console.log();
      }
      return;
    }

    case 'skill': {
      if (!argStr) { logger.warn('Usage: /skill <name>'); return; }
      const skill = ctx.skillRegistry.getByName(argStr);
      if (!skill) {
        logger.error(`Skill "${argStr}" not found. Type /skills to see what's available.`);
        return;
      }
      const body = ctx.skillRegistry.loadBody(skill);
      console.log(chalk.bold(`\nSkill: ${skill.name}`));
      console.log(chalk.cyan(`Description: ${skill.description}`));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(body);
      console.log();
      return;
    }

    case 'approvals': {
      if (!argStr) {
        const mode = ctx.approvalManager ? ctx.approvalManager.getMode() : 'none';
        console.log(chalk.bold(`\nCurrent approval mode: ${chalk.cyan(mode)}`));
        console.log(chalk.gray('  suggest    — prompt before file writes, commands, and destructive ops'));
        console.log(chalk.gray('  auto-edit  — auto-approve file writes, prompt for commands and destructive ops'));
        console.log(chalk.gray('  full-auto  — auto-approve everything except destructive git ops'));
        console.log(chalk.gray(`\nUsage: /approvals <mode>`));
        console.log();
        return;
      }
      if (!ctx.approvalManager) {
        logger.warn('ApprovalManager is not initialized.');
        return;
      }
      if (ctx.approvalManager.setMode(argStr)) {
        logger.info(`Approval mode set to: ${argStr}`);
      } else {
        logger.error(`Invalid mode "${argStr}". Use: suggest, auto-edit, or full-auto.`);
      }
      return;
    }

    default:
      logger.warn(`Unknown command: /${command}. Type /help to see available commands.`);
  }
}

/** Wraps a readline interface so bursts of pasted lines are merged into one input. */
function createPasteSafeInput(rl, onSubmit) {
  let buffer = [];
  let timer = null;

  rl.on('line', (line) => {
    buffer.push(line);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const text = buffer.join('\n').trim();
      buffer = [];
      timer = null;
      onSubmit(text);
    }, PASTE_FLUSH_MS);
  });
}

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const config = await resolveConfig(cliArgs);

  const devyPaths = ensureDevyAgentDir(config.workspaceDir);
  const llmClient = new OllamaClient({ host: config.ollama.host, model: config.ollama.model });

  const contextManager = new ContextManager({
    contextLength: config.ollama.contextLength,
    compressionThreshold: config.compressionThreshold,
    toolOutputMaxChars: config.toolOutputMaxChars,
    cacheDir: devyPaths.cacheDir
  });

  const { tools, planStore, memoryStore, chatLog, projectContext, skillRegistry } = buildToolRegistry(config, contextManager, devyPaths, llmClient);
  
  // Connect and register MCP servers dynamically
  const mcpClients = await connectAndRegisterMCP(tools, projectContext.dir);

  const cleanup = async () => {
    for (const client of mcpClients) {
      try {
        await client.disconnect();
      } catch (_) {}
    }
  };

  const toolsDescription = describeToolsCompact(tools);
  const rules = loadRules(projectContext.dir);
  const skillIndex = skillRegistry.describeCompact();

  const systemPrompt = buildSystemPrompt({
    toolsDescription,
    workspaceDir: config.workspaceDir,
    githubDefaults: config.github,
    memoryPreview: memoryStore.preview(),
    rules,
    skillIndex
  });

  const approvalManager = new ApprovalManager({ mode: 'full-auto' });

  const orchestrator = new Orchestrator({
    llmClient, tools, planStore, chatLog, projectContext, thinkLog: [], contextManager, systemPrompt,
    maxSteps: config.maxAgentSteps, approvalManager
  });

  const ctx = { config, llmClient, planStore, memoryStore, projectContext, contextManager, orchestrator, skillRegistry, approvalManager };

  printBanner(config);
  logger.info(`Project data folder: ${path.relative(process.cwd(), devyPaths.devyDir) || DEVY_DIR_NAME} (plan, memory, chat log, tool-output cache)`);

  const taskFromArgv = cliArgs._.filter((a) => a !== 'chat').join(' ').trim();
  if (taskFromArgv) {
    if (taskFromArgv.startsWith('/')) {
      await handleSlashCommand(taskFromArgv, ctx);
    } else {
      await orchestrator.runTask(taskFromArgv);
    }
    await cleanup();
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: chalk.bold('> ') });
  rl.prompt();

  let taskRunning = false;

  rl.on('SIGINT', async () => {
    if (taskRunning) {
      orchestrator.abort();
      // The orchestrator logs "Task stopped." itself once the aborted call unwinds.
    } else {
      await cleanup();
      rl.close();
    }
  });

  createPasteSafeInput(rl, async (text) => {
    if (!text) { rl.prompt(); return; }
    if (['exit', 'quit'].includes(text.toLowerCase())) {
      await cleanup();
      rl.close();
      return;
    }

    taskRunning = true;
    try {
      if (text.startsWith('/')) {
        await handleSlashCommand(text, ctx);
      } else {
        await orchestrator.runTask(text);
      }
    } catch (e) {
      logger.error('Unexpected error: ' + e.message);
    }
    taskRunning = false;
    rl.prompt();
  });

  rl.on('close', async () => {
    await cleanup();
    console.log(chalk.gray('\nGoodbye 👋'));
    process.exit(0);
  });
}

main().catch((e) => {
  logger.error(e.stack || e.message);
  process.exit(1);
});
