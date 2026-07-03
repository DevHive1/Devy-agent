'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const dotenv = require('dotenv');
const logger = require('../utils/logger');
const { cleanRepoToken } = require('../tools/githubShared');

const CONFIG_DIR = path.join(os.homedir(), '.devy-agent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const GLOBAL_ENV_FILE = path.join(CONFIG_DIR, '.env');

// Env resolution order: real shell environment > project-local ./.env (relative to cwd) >
// global ~/.devy-agent/.env. dotenv never overwrites a variable that's already set, so
// loading cwd's .env first and the global one second gives exactly that priority. This is
// what lets the agent run as a global command from any directory and still pick up a
// GITHUB_TOKEN/OLLAMA_HOST configured once, instead of requiring a .env in every project.
dotenv.config();
if (fs.existsSync(GLOBAL_ENV_FILE)) {
  dotenv.config({ path: GLOBAL_ENV_FILE });
}

function loadPersistedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) { /* ignore a corrupt config file */ }
  return {};
}

function savePersistedConfig(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    logger.warn('Could not save local settings: ' + e.message);
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

/**
 * Lists the models actually available on the local Ollama server - no model name is ever
 * hardcoded in this project.
 */
async function listOllamaModels(host) {
  let res;
  try {
    res = await fetch(`${host}/api/tags`);
  } catch (networkErr) {
    throw new Error(`Cannot reach Ollama at ${host}. Make sure "ollama serve" is running and OLLAMA_HOST is correct. (${networkErr.message})`);
  }
  if (!res.ok) throw new Error(`Ollama request to ${host} failed (status ${res.status})`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

async function getModelContextLength(host, modelName) {
  try {
    const res = await fetch(`${host}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const info = data.model_info || {};
    // The context-length key's name varies by model family (e.g. llama.context_length)
    const key = Object.keys(info).find((k) => k.endsWith('context_length'));
    return key ? Number(info[key]) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Interactively pick a model from what's actually installed in Ollama.
 * Exposed separately so bin/agent.js can reuse it for the /model command.
 */
async function promptForModel(availableModels) {
  console.log('\nModels available in your Ollama install:');
  availableModels.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  const ans = await ask('\nPick a model number to use: ');
  const idx = parseInt(ans, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= availableModels.length) {
    throw new Error('Invalid selection.');
  }
  return availableModels[idx];
}

/**
 * Builds the full runtime configuration. If a model is pinned (via .env or a saved
 * preference) and it's actually installed, it's used directly; otherwise the user is shown
 * an interactive list built from the real Ollama models on their machine.
 */
async function resolveConfig(cliArgs = {}) {
  const persisted = loadPersistedConfig();
  const host = cliArgs.host || process.env.OLLAMA_HOST || persisted.ollamaHost || 'http://localhost:11434';

  let model = cliArgs.model || process.env.OLLAMA_MODEL || persisted.ollamaModel || null;

  let availableModels = [];
  try {
    availableModels = await listOllamaModels(host);
  } catch (e) {
    logger.error(e.message);
    process.exit(1);
  }

  if (availableModels.length === 0) {
    logger.error('No models are installed in Ollama. Pull one first, e.g.: ollama pull qwen2.5-coder');
    process.exit(1);
  }

  if (!model || !availableModels.includes(model)) {
    if (model && !availableModels.includes(model)) {
      logger.warn(`Model "${model}" is not actually installed in your Ollama.`);
    }
    try {
      model = await promptForModel(availableModels);
    } catch (e) {
      logger.error(e.message);
      process.exit(1);
    }
    savePersistedConfig({ ...persisted, ollamaHost: host, ollamaModel: model });
  }

  const contextLength = (await getModelContextLength(host, model)) || Number(process.env.DEFAULT_CONTEXT_TOKENS) || 8192;

  // Default to the current directory - this is what makes `devy-git chat` work like a normal
  // global CLI tool: cd into whatever project you want to work on, run it, and it operates
  // there. WORKSPACE_DIR (env or --workspace) can still override this explicitly.
  const workspaceDir = path.resolve(cliArgs.workspace || process.env.WORKSPACE_DIR || process.cwd());
  fs.mkdirSync(workspaceDir, { recursive: true });

  return {
    ollama: { host, model, contextLength },
    github: {
      token: process.env.GITHUB_TOKEN || null,
      defaultOwner: cleanRepoToken(process.env.GITHUB_DEFAULT_OWNER),
      defaultRepo: cleanRepoToken(process.env.GITHUB_DEFAULT_REPO),
      defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main'
    },
    workspaceDir,
    compressionThreshold: Number(process.env.CONTEXT_COMPRESSION_THRESHOLD) || 0.65,
    toolOutputMaxChars: Number(process.env.TOOL_OUTPUT_MAX_CHARS) || 4000,
    maxAgentSteps: Number(process.env.MAX_AGENT_STEPS) || 40
  };
}

module.exports = {
  resolveConfig,
  listOllamaModels,
  loadPersistedConfig,
  savePersistedConfig,
  CONFIG_DIR,
  GLOBAL_ENV_FILE
};
