#!/usr/bin/env node
'use strict';
/**
 * Devy Agent — Self Check
 *
 * A single, comprehensive, offline diagnostic that exercises every part of the project:
 * syntax, module loading, the GitHub owner/repo normalizer, the response protocol parser,
 * the persistent plan/task store (including regression coverage for bugs that were fixed:
 * the "task_id" alias and the corrupted-plan-from-object-tasks issue), persistent project
 * memory, all 10 new project-management/diagnostic tools, the project-switching mechanism
 * (set_project re-pointing plan/memory/chat/cache), context compression/truncation, config
 * helpers, the full tool registry, and the Ollama client's error handling.
 *
 * No network access, running Ollama instance, or GitHub token is required - anything that
 * would need one is either skipped with a clear note or tested only for its offline error
 * handling (e.g. "Ollama unreachable" produces a clear message rather than a crash).
 *
 * Run:  node scripts/selfcheck.js
 * (requires `npm install` to have been run first, same as running the agent itself)
 *
 * If anything fails, copy the "Failed checks" section at the end and send it along -
 * that's enough to diagnose the issue without needing to reproduce it interactively.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passCount = 0;
let failCount = 0;
const failures = [];

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`
};

function section(title) {
  console.log(`\n${c.bold(c.cyan('▸ ' + title))}`);
}

function check(name, fn) {
  try {
    fn();
    console.log(`  ${c.green('✓')} ${name}`);
    passCount++;
  } catch (e) {
    console.log(`  ${c.red('✗ ' + name)}`);
    console.log(`    ${c.red(e.message)}`);
    failCount++;
    failures.push({ name, error: e.message });
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  ${c.green('✓')} ${name}`);
    passCount++;
  } catch (e) {
    console.log(`  ${c.red('✗ ' + name)}`);
    console.log(`    ${c.red(e.message)}`);
    failCount++;
    failures.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `devy-selfcheck-${name}-`));
}
function printSummary() {
  console.log('\n' + '─'.repeat(50));
  console.log(`${c.bold('Results:')} ${c.green(passCount + ' passed')}, ${failCount > 0 ? c.red(failCount + ' failed') : failCount + ' failed'}`);
  if (failCount > 0) {
    console.log('\nFailed checks:');
    failures.forEach((f) => console.log(`  - ${f.name}\n    ${f.error}`));
    console.log('\nSend the failed check name(s) and error message(s) above.');
  } else {
    console.log(c.green('All checks passed.'));
  }
}

(async () => {
  console.log(c.bold('Devy Agent — Self Check'));
  console.log(`Root: ${ROOT}\n`);

  // ---------- 1. Syntax ----------
  section('1. Syntax check (every .js file)');
  function listJsFiles(dir) {
    let out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out = out.concat(listJsFiles(full));
      else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
  }
  const jsFiles = listJsFiles(ROOT);
  check(`found a reasonable number of .js files (${jsFiles.length})`, () => assert(jsFiles.length > 20, 'expected more than 20 source files'));
  for (const f of jsFiles) {
    check(`node --check ${path.relative(ROOT, f)}`, () => {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    });
  }

  // ---------- 2. Module loading ----------
  section('2. Module loading');
  const mods = {};
  const req = (name, rel) => check(`require ${rel}`, () => { mods[name] = require(path.join(ROOT, rel)); });
  req('githubShared', 'src/tools/githubShared');
  req('parser', 'src/core/parser');
  req('projectContext', 'src/core/projectContext');
  req('projectStore', 'src/core/projectStore');
  req('sessionLog', 'src/core/sessionLog');
  req('contextManager', 'src/core/contextManager');
  req('orchestrator', 'src/core/orchestrator');
  req('promptBuilder', 'src/core/promptBuilder');
  req('planTools', 'src/tools/planTools');
  req('memoryTools', 'src/tools/memoryTools');
  req('fileTools', 'src/tools/fileTools');
  req('terminalTools', 'src/tools/terminalTools');
  req('gitTools', 'src/tools/gitTools');
  req('githubTools', 'src/tools/githubTools');
  req('githubActionsTools', 'src/tools/githubActionsTools');
  req('pmTools', 'src/tools/projectManagementTools');
  req('switchTools', 'src/tools/projectSwitchTools');
  req('thinkTools', 'src/tools/thinkTools');
  req('toolsIndex', 'src/tools/index');
  req('ollamaClientModule', 'src/llm/ollama');
  req('config', 'src/config');
  req('logger', 'src/utils/logger');
  req('tokenEstimate', 'src/utils/tokenEstimate');

  if (failCount > 0) {
    console.log('\n' + c.red('Stopping early: core modules failed to load, later checks would be unreliable.'));
    printSummary();
    process.exit(1);
  }
  const OllamaClient = mods.ollamaClientModule;

  // ---------- 3. GitHub owner/repo normalization ----------
  section('3. GitHub owner/repo normalization');
  const { normalizeOwnerRepo, cleanRepoToken } = mods.githubShared;
  check('splits a full URL used as the default repo', () => {
    const r = normalizeOwnerRepo({}, { defaultOwner: 'foo', defaultRepo: 'https://github.com/foo/bar' });
    assertEqual(r.owner, 'foo'); assertEqual(r.repo, 'bar');
  });
  check('splits when both defaults are full URLs (owner combined too)', () => {
    const r = normalizeOwnerRepo({}, { defaultOwner: 'https://github.com/foo/bar', defaultRepo: 'https://github.com/foo/bar' });
    assertEqual(r.owner, 'foo'); assertEqual(r.repo, 'bar');
  });
  check('splits combined "owner/repo" passed as the repo param', () => {
    const r = normalizeOwnerRepo({ repo: 'foo/bar' }, { defaultOwner: null, defaultRepo: null });
    assertEqual(r.owner, 'foo'); assertEqual(r.repo, 'bar');
  });
  check('strips a trailing .git suffix', () => {
    const r = normalizeOwnerRepo({}, { defaultOwner: 'foo', defaultRepo: 'https://github.com/foo/bar.git' });
    assertEqual(r.repo, 'bar');
  });
  check('leaves already-correct values untouched', () => {
    const r = normalizeOwnerRepo({ owner: 'a', repo: 'b' }, { defaultOwner: null, defaultRepo: null });
    assertEqual(r.owner, 'a'); assertEqual(r.repo, 'b');
  });
  check('cleanRepoToken strips a full GitHub URL', () => assertEqual(cleanRepoToken('https://github.com/foo/bar'), 'foo/bar'));
  check('cleanRepoToken strips a .git suffix', () => assertEqual(cleanRepoToken('bar.git'), 'bar'));

  // ---------- 4. Agent response parser ----------
  section('4. Agent response protocol parser');
  const { parseAgentResponse } = mods.parser;
  check('parses a well-formed ACTION', () => {
    const r = parseAgentResponse('THINK: ok\nACTION: {"tool":"git_status","params":{}}');
    assertEqual(r.type, 'action'); assertEqual(r.tool, 'git_status');
  });
  check('parses a well-formed FINAL', () => {
    const r = parseAgentResponse('THINK: done\nFINAL: All set.');
    assertEqual(r.type, 'final'); assertEqual(r.text, 'All set.');
  });
  check('flags an ACTION with no tool field as malformed (not a silent failure)', () => {
    assertEqual(parseAgentResponse('THINK: x\nACTION: {"params":{}}').type, 'malformed_action');
  });
  check('flags a non-JSON ACTION as malformed', () => {
    assertEqual(parseAgentResponse('THINK: x\nACTION: do the thing').type, 'malformed_action');
  });
  check('repairs and parses an ACTION with trailing commas', () => {
    const r = parseAgentResponse('THINK: ok\nACTION: {"tool":"git_status","params":{},}');
    assertEqual(r.type, 'action');
  });
  check('repairs and parses an ACTION with raw newlines in strings', () => {
    const r = parseAgentResponse('THINK: ok\nACTION: {"tool":"write_file","params":{"content":"line 1\nline 2"}}');
    assertEqual(r.type, 'action');
    assertEqual(r.params.content, 'line 1\nline 2');
  });
  check('repairs and parses an ACTION with single-quoted keys/strings', () => {
    const r = parseAgentResponse("THINK: ok\nACTION: {'tool':'run_command','params':{'CommandLine':'git log --oneline'}}");
    assertEqual(r.type, 'action');
    assertEqual(r.tool, 'run_command');
    assertEqual(r.params.CommandLine, 'git log --oneline');
  });
  check('repairs and parses an ACTION with unquoted keys', () => {
    const r = parseAgentResponse('THINK: ok\nACTION: {tool: "git_status", params: {}}');
    assertEqual(r.type, 'action');
    assertEqual(r.tool, 'git_status');
  });

  // ---------- 5. Persistent plan/task store (+ regression coverage) ----------
  section('5. Plan/task store — persistence + regression coverage');
  const { PlanStore, buildPlanTools } = mods.planTools;
  const planPath = path.join(tmpDir('plan'), 'plan.json');
  const planStore = new PlanStore(planPath);
  check('creating a plan stores its tasks', () => {
    planStore.create('demo goal', ['task a', 'task b']);
    assertEqual(planStore.summary().tasks.length, 2);
  });
  check('plan survives being reloaded from disk in a fresh instance', () => {
    const reloaded = new PlanStore(planPath);
    assertEqual(reloaded.summary().goal, 'demo goal');
    assertEqual(reloaded.summary().tasks.length, 2);
  });
  const planToolsBuilt = buildPlanTools(planStore);
  await checkAsync('update_task accepts the "task_id" alias (regression: previously silently undefined)', async () => {
    const r = await planToolsBuilt.update_task.handler({ task_id: 1, status: 'done' });
    assert(!r.error, 'expected no error, got: ' + JSON.stringify(r));
    assertEqual(r.tasks[0].status, 'done');
  });
  await checkAsync('update_task rejects an invalid status value', async () => {
    const r = await planToolsBuilt.update_task.handler({ id: 1, status: 'bogus-status' });
    assert(r.error, 'expected an error for an invalid status');
  });
  await checkAsync('create_plan cleans up object-shaped tasks instead of corrupting the plan (regression)', async () => {
    const r = await planToolsBuilt.create_plan.handler({
      goal: 'g',
      tasks: [{ id: 1, title: 'do a thing', status: 'pending' }, 'plain string task']
    });
    assert(!r.error, 'expected no error, got: ' + JSON.stringify(r));
    assertEqual(typeof r.tasks[0].title, 'string');
    assertEqual(r.tasks[0].title, 'do a thing');
  });

  // ---------- 6. Persistent project memory ----------
  section('6. Persistent project memory');
  const { MemoryStore } = mods.memoryTools;
  const memoryStore = new MemoryStore(path.join(tmpDir('memory'), 'memory.md'));
  check('memory file is created with default content', () => assert(memoryStore.read().includes('Project Memory')));
  check('memory_append persists and is readable back', () => {
    memoryStore.append('remember this fact');
    assert(memoryStore.read().includes('remember this fact'));
  });

  // ---------- 7. New project-management & diagnostic tools ----------
  section('7. New project-management & diagnostic tools (10 new tools)');
  const { ProjectContext } = mods.projectContext;
  const { buildProjectManagementTools } = mods.pmTools;
  const pmSandbox = tmpDir('pm');
  const pmCtx = new ProjectContext(pmSandbox);
  const pm = buildProjectManagementTools(pmCtx);

  await checkAsync('make_dir creates a nested directory', async () => {
    const r = await pm.make_dir.handler({ path: 'src/components' });
    assert(!r.error, JSON.stringify(r));
    assert(fs.existsSync(path.join(pmSandbox, 'src/components')));
  });
  fs.writeFileSync(path.join(pmSandbox, 'src/components/Foo.txt'), 'hello world\nsecond line');
  await checkAsync('file_info reports size and line count', async () => {
    const r = await pm.file_info.handler({ path: 'src/components/Foo.txt' });
    assert(!r.error, JSON.stringify(r));
    assertEqual(r.line_count, 2);
  });
  await checkAsync('copy_path duplicates a file', async () => {
    const r = await pm.copy_path.handler({ from: 'src/components/Foo.txt', to: 'src/components/Bar.txt' });
    assert(!r.error, JSON.stringify(r));
    assert(fs.existsSync(path.join(pmSandbox, 'src/components/Bar.txt')));
  });
  await checkAsync('move_path renames a file', async () => {
    const r = await pm.move_path.handler({ from: 'src/components/Bar.txt', to: 'src/components/Baz.txt' });
    assert(!r.error, JSON.stringify(r));
    assert(!fs.existsSync(path.join(pmSandbox, 'src/components/Bar.txt')));
    assert(fs.existsSync(path.join(pmSandbox, 'src/components/Baz.txt')));
  });
  await checkAsync('find_files matches by basename pattern recursively', async () => {
    const r = await pm.find_files.handler({ pattern: '*.txt' });
    assert(!r.error, JSON.stringify(r));
    assert(r.files.some((f) => f.endsWith('Foo.txt')));
    assert(r.files.some((f) => f.endsWith('Baz.txt')));
  });
  await checkAsync('read_many_files reads multiple files in one call', async () => {
    const r = await pm.read_many_files.handler({ paths: ['src/components/Foo.txt', 'src/components/Baz.txt'] });
    assert(!r.error, JSON.stringify(r));
    assert(r.files['src/components/Foo.txt'].content.includes('hello world'));
  });
  await checkAsync('delete_path removes a file', async () => {
    const r = await pm.delete_path.handler({ path: 'src/components/Baz.txt' });
    assert(!r.error, JSON.stringify(r));
    assert(!fs.existsSync(path.join(pmSandbox, 'src/components/Baz.txt')));
  });
  await checkAsync('delete_path refuses to delete the project root', async () => {
    const r = await pm.delete_path.handler({ path: '.', recursive: true });
    assert(r.error, 'expected an error - deleting the root should be refused');
  });
  fs.writeFileSync(path.join(pmSandbox, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'echo no-op-test && exit 0' } }));
  await checkAsync('detect_project recognizes a Node manifest and its scripts', async () => {
    const r = await pm.detect_project.handler({});
    assert(!r.error, JSON.stringify(r));
    assert(r.detected.includes('node'));
    assert(r.node && r.node.scripts && r.node.scripts.test, 'expected node.scripts.test to be reported');
  });
  await checkAsync('run_tests auto-detects and runs "npm test"', async () => {
    const r = await pm.run_tests.handler({ timeout_ms: 15000 });
    assert(!r.error, JSON.stringify(r));
    assertEqual(r.command_used, 'npm test');
  });
  await checkAsync('check_tool_installed finds a binary that exists (node)', async () => {
    const r = await pm.check_tool_installed.handler({ binary: 'node' });
    assertEqual(r.installed, true);
  });
  await checkAsync('check_tool_installed reports a bogus binary as missing', async () => {
    const r = await pm.check_tool_installed.handler({ binary: 'definitely-not-a-real-binary-xyz' });
    assertEqual(r.installed, false);
  });

  // ---------- 8. File tools follow the active project directory ----------
  section('8. File tools follow the active project directory (live re-rooting)');
  const { buildFileTools } = mods.fileTools;
  const fileCtxSandbox = tmpDir('filectx');
  const fileCtx = new ProjectContext(fileCtxSandbox);
  const fTools = buildFileTools(fileCtx);
  await checkAsync('write_file writes into the current project dir', async () => {
    const r = await fTools.write_file.handler({ path: 'a.txt', content: 'v1' });
    assert(!r.error, JSON.stringify(r));
    assert(fs.existsSync(path.join(fileCtxSandbox, 'a.txt')));
  });
  const subDir = path.join(fileCtxSandbox, 'sub-project');
  fs.mkdirSync(subDir);
  check('switching the project context redirects subsequent tool calls', () => {
    fileCtx.switchToSubproject(subDir, 'sub-project');
    assertEqual(fileCtx.dir, subDir);
  });
  await checkAsync('write_file now writes into the switched subdirectory, not the old one', async () => {
    const r = await fTools.write_file.handler({ path: 'b.txt', content: 'v2' });
    assert(!r.error, JSON.stringify(r));
    assert(fs.existsSync(path.join(subDir, 'b.txt')));
    assert(!fs.existsSync(path.join(fileCtxSandbox, 'b.txt')));
  });

  // ---------- 9. set_project — full plan/memory/chat/cache re-pointing ----------
  section('9. set_project tool — plan/memory/chat/cache re-pointing');
  const spSandbox = tmpDir('setproject');
  const spCtx = new ProjectContext(spSandbox);
  const rootDevy = mods.projectStore.ensureDevyAgentDir(spSandbox);
  const spPlan = new PlanStore(rootDevy.planPath);
  const spMemory = new MemoryStore(rootDevy.memoryPath);
  const { SessionLog } = mods.sessionLog;
  const spChat = new SessionLog(rootDevy.chatPath);
  const { ContextManager } = mods.contextManager;
  const spContextManager = new ContextManager({ contextLength: 8192, compressionThreshold: 0.65, toolOutputMaxChars: 4000, cacheDir: rootDevy.cacheDir });
  const { buildProjectSwitchTools } = mods.switchTools;
  const spTools = buildProjectSwitchTools({ projectContext: spCtx, planStore: spPlan, memoryStore: spMemory, chatLog: spChat, contextManager: spContextManager });

  spPlan.create('root goal', ['root task']);
  await checkAsync('set_project creates a subdirectory and switches into it (name is slugified)', async () => {
    const r = await spTools.set_project.handler({ name: 'My Cool App!!' });
    assert(!r.error, JSON.stringify(r));
    assertEqual(r.project, 'my-cool-app');
    assert(fs.existsSync(path.join(spSandbox, 'my-cool-app')));
  });
  check('plan store now points at the subproject\'s own fresh plan.json, not the root plan', () => {
    assertEqual(spPlan.summary().goal, null);
    assert(spPlan.filePath.includes('my-cool-app'));
  });
  check('memory store now points at the subproject\'s own memory.md', () => assert(spMemory.filePath.includes('my-cool-app')));
  check('context manager cache dir now points at the subproject', () => assert(spContextManager.cacheDir.includes('my-cool-app')));

  // ---------- 10. Context manager ----------
  section('10. Context manager (truncation, reset)');
  const cm = new ContextManager({ contextLength: 8192, compressionThreshold: 0.65, toolOutputMaxChars: 50, cacheDir: tmpDir('ctxmgr') });
  check('short tool output is not truncated', () => assert(!cm.truncateToolOutput('x', { ok: true }).truncated));
  check('long tool output is truncated and the full version cached to disk', () => {
    const r = cm.truncateToolOutput('x', { data: 'x'.repeat(500) });
    assert(r.truncated);
    assert(fs.readdirSync(cm.cacheDir).length > 0, 'expected a cache file to be written');
  });
  check('reset() clears the active conversation', () => {
    cm.addMessage('user', 'hi');
    cm.reset();
    assertEqual(cm.messages.length, 0);
  });

  // ---------- 11. Full tool registry wiring ----------
  section('11. Full tool registry (all tools + categories present)');
  const regSandbox = tmpDir('registry');
  const regDevy = mods.projectStore.ensureDevyAgentDir(regSandbox);
  const regContextManager = new ContextManager({ contextLength: 8192, compressionThreshold: 0.65, toolOutputMaxChars: 4000, cacheDir: regDevy.cacheDir });
  const registryConfig = { workspaceDir: regSandbox, github: { token: null, defaultOwner: null, defaultRepo: null, defaultBranch: 'main' } };
  const { tools: allTools } = mods.toolsIndex.buildToolRegistry(registryConfig, regContextManager, regDevy);
  check(`tool count is comfortably above 100 (got ${Object.keys(allTools).length})`, () => assert(Object.keys(allTools).length >= 100));
  [
    'read_file', 'write_file', 'edit_file', 'make_dir', 'move_path', 'copy_path', 'delete_path',
    'find_files', 'read_many_files', 'file_info', 'detect_project', 'run_tests', 'check_tool_installed',
    'set_project', 'git_check_ignore', 'create_plan', 'update_task', 'memory_append'
  ].forEach((name) => check(`registry includes "${name}"`, () => assert(allTools[name], 'missing tool')));

  const desc = mods.toolsIndex.describeToolsCompact(allTools);
  [
    '[Files', '[Project management]', '[Diagnostics]', '[Terminal]', '[Git (local)]',
    '[GitHub Actions]', '[GitHub (remote', '[Planning]', '[Project memory]', '[Project switching]', '[Reasoning]'
  ].forEach((label) => check(`tool description includes category ${label}`, () => assert(desc.includes(label))));

  // ---------- 12. Ollama client (offline checks only) ----------
  section('12. Ollama client — offline checks only (no live server required)');
  check('OllamaClient can be instantiated', () => {
    const client = new OllamaClient({ host: 'http://localhost:11434', model: 'stub' });
    assert(typeof client.chat === 'function');
  });
  await checkAsync('chat() surfaces a clear error when Ollama is unreachable (instead of an unhandled rejection)', async () => {
    const client = new OllamaClient({ host: 'http://127.0.0.1:1', model: 'stub' });
    try {
      await client.chat([{ role: 'user', content: 'hi' }]);
      throw new Error('expected chat() to reject when Ollama is unreachable');
    } catch (e) {
      assert(/Cannot reach Ollama/.test(e.message), `unexpected error message: ${e.message}`);
    }
  });

  printSummary();
  process.exit(failCount > 0 ? 1 : 0);
})().catch((e) => {
  console.error(c.red('Self-check crashed unexpectedly:'), e.stack || e.message);
  process.exit(1);
});
