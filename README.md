# 🤖 Devy Agent (git-agent-cli)

An autonomous CLI agent for Git, GitHub, and codebase work, built on Node.js and running entirely through **local Ollama** (no model name is ever hardcoded - the model comes from what you actually have installed).

## ✨ Features

- **No fixed model**: the agent talks to the Ollama API, lists the models actually installed on your machine, and lets you pick - or uses whatever is set in `.env` / saved from a previous `/model` choice.
- **111 tools**, grouped as:
  - **Files** (5): read / write / precise edit (`edit_file`, old_str → new_str) / directory tree / content search. `write_file`/`edit_file` are the preferred way to create or change file content - a shell heredoc is only a fallback if they genuinely fail.
  - **Project management** (7, new): `make_dir`, `move_path`, `copy_path`, `delete_path`, `find_files` (glob-style filename search), `read_many_files` (batch read), `file_info` (size/type/line-count without reading the whole file).
  - **Diagnostics** (3, new): `detect_project` (identify the tech stack, manifest, npm scripts), `run_tests` (auto-detect and run the test suite, structured pass/fail), `check_tool_installed` (verify a binary is on PATH before relying on it).
  - **Terminal** (1): `execute_command`, for anything with no dedicated tool (installs, dev servers, toolchains).
  - **Git, local** (51): built from the official git documentation - `init`, `add`, `commit`, `branch`, `merge`, `rebase`, `stash`, `bisect`, `reflog`, `check-ignore`... down to a `git_raw` fallback for anything not covered.
  - **GitHub, remote** (19): edit a repo **directly via token, no `clone` required** (read/write/delete files, an **atomic multi-file commit** in one call, branches, Pull Requests, Issues, code search) - plus `git_clone` if you'd rather work locally.
  - **GitHub Actions** (16): list/trigger/cancel/re-run workflows, inspect runs and jobs, pull job logs, artifacts.
  - **Planning** (4): `create_plan`, `update_task`, `add_task`, `get_plan` - persisted per project, with input validation that rejects malformed task data instead of silently corrupting the plan.
  - **Project memory** (3): `memory_read`, `memory_append`, `memory_write` - durable notes that survive across sessions.
  - **Project switching** (1, new): `set_project` - creates/switches into a dedicated subdirectory for a distinct project.
  - **Reasoning** (1): `think`, a scratchpad for multi-step reasoning before acting.
  - **Subagent Orchestration** (new): `spawn_subagents_parallel` allows the agent to break down a complex goal into multiple independent subtasks and execute them in parallel, collecting all results at once. It includes a built-in caching system to avoid redundant LLM calls for identical tasks.
- **Every project gets its own space.** The agent's base directory is wherever you run it from. When you ask it to build something new and separate, it calls `set_project` to create a dedicated subdirectory - and that subproject gets its **own** `.devy-agent/` folder with its own plan, persistent memory, chat log, and tool-output cache. Switching between projects in the same workspace switches all of that automatically; nothing gets mixed together in one shared root.
- **A chat log, not just a step trace.** Alongside the plan and memory, each project keeps a clean `.devy-agent/chat.md` record of what was asked and what was delivered - separate from the verbose step-by-step terminal output.
- **Automatic context compression**: as the conversation nears the model's context window, the agent summarizes the oldest part of the history (using the same model) while keeping key decisions and facts, and truncates long tool outputs (caching the full version locally).
- **Multi-step thinking + planning** via an explicit `THINK / ACTION / FINAL` protocol, with automatic recovery if the model returns a malformed action (asks it to retry instead of silently failing or looping forever).
- **Stoppable.** Press `Ctrl+C` while the agent is working to cancel the current step and get control back; press it again at an idle prompt to quit.
- **Paste-safe input.** Pasting a multi-line block into the prompt is submitted as one input, not split into one task per line.
- **Clear, categorized output.** Every tool call is shown with an icon for its category (📖 read, 📝 write, ✏️ edit, 🔧 git, 🐙 GitHub, 🩺 diagnostics, 📋 plan, 🧠 memory, 🤔 thinking...) so it's obvious at a glance what the agent is actually doing.
- **Slash commands** for direct control without going through the model - see below.

## 📦 Installation (Termux)

```bash
pkg install nodejs-lts git -y
cd git-agent-cli
npm install
```

Make sure Ollama is running:

```bash
ollama serve &
ollama pull qwen2.5-coder   # or any model you already have
```

### Option A: run it in place

```bash
cp .env.example .env
node bin/agent.js chat
```

### Option B: install it globally as `devy-git` (recommended)

This lets you run the agent from *any* project directory, not just this folder:

```bash
npm install -g .
# or, for local development without publishing:
npm link
```

Then put your settings in a **global** env file instead of a per-project `.env`:

```bash
mkdir -p ~/.devy-agent
cp .env.example ~/.devy-agent/.env
# edit ~/.devy-agent/.env with your GITHUB_TOKEN etc.
```

Now from anywhere:

```bash
cd ~/projects/my-repo
devy-git chat
```

By default the agent operates on **whatever directory you run it from** (like `git` itself) - no need to set `WORKSPACE_DIR` unless you want to point it somewhere else. A project-local `.env` (if present in the current directory) always takes priority over the global one, so you can still override settings per-project.

Fill in at least:

```env
OLLAMA_HOST=http://localhost:11434
# leave OLLAMA_MODEL empty to pick interactively from what's actually installed

GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx   # only needed for GitHub/Actions tools
GITHUB_DEFAULT_OWNER=username
GITHUB_DEFAULT_REPO=repo-name           # just the name, NOT a full URL
```

## 🚀 Usage

Interactive chat mode (best for anything non-trivial):

```bash
devy-git chat
# or, if not installed globally:
node bin/agent.js chat
```

Run a single task directly from the command line:

```bash
devy-git "check repo status, stage any modified files, and commit with a sensible message"
```

Pin a model/host/workspace for one run:

```bash
devy-git --model qwen2.5-coder:7b --workspace ~/projects/my-repo chat
```

While a task is running, press **Ctrl+C** to stop it and get the prompt back - the plan and memory saved so far aren't lost. Press Ctrl+C again at an idle prompt to quit.

### Slash commands (inside chat mode)

| Command | What it does |
|---|---|
| `/help` | List all commands |
| `/models` | List models installed in Ollama |
| `/model <name>` | Switch the active model for this session |
| `/plan` | Show the current plan and task status |
| `/task` | List tasks — see `/task` alone for full usage (`add`, `done`, `<id> <status>`) |
| `/memory` | Show the active project's persistent memory (`.devy-agent/memory.md`) |
| `/project` | Show which project directory is currently active |
| `/clear` | Clear the active conversation (plan and memory are kept) |
| `Ctrl+C` | Stop the agent mid-task; press again at an idle prompt to quit |
| `exit` / `quit` | Leave the chat |

## 🔑 Required GitHub token scopes

For every tool to work (file edits, branches, PRs, Actions):
- Classic token: `repo` + `workflow`
- Fine-grained token: Contents (Read/Write), Pull requests (Read/Write), Actions (Read/Write), Workflows (Read/Write)

## 🗂️ Project layout

```
bin/agent.js                     entry point + slash commands + input handling
src/config/                      Ollama model discovery, settings resolution, global/local env loading
src/llm/ollama.js                Ollama client (chat + streaming + abort support)
src/core/                        protocol parser, system prompt, context manager, main loop,
                                  project store, project context, session (chat) log
src/tools/                       every tool (files, project management, diagnostics, terminal,
                                  git, GitHub, Actions, planning, memory, project switching, thinking)
scripts/selfcheck.js             offline diagnostic covering every part of the project (see below)
~/.devy-agent/.env                optional global settings (used when run as `devy-git` from any directory)
~/.devy-agent/config.json         saved model/host preference
<workspace>/.devy-agent/          base workspace's plan.json, memory.md, chat.md, cache (if working there directly)
<workspace>/<project>/.devy-agent/  a subproject's own plan/memory/chat/cache, created by set_project
```

By default `<workspace>` is just the current directory - the agent works wherever you run it from. For a brand-new, separate project it creates its own subdirectory (via `set_project`) instead of mixing files into an unrelated directory.

## 🩺 Checking that everything works

Run the self-check script any time - after installing, after pulling an update, or if something seems off:

```bash
node scripts/selfcheck.js
```

It's fully offline (no Ollama server or GitHub token required) and checks syntax, module loading, the GitHub owner/repo normalizer, the response protocol parser, plan/task persistence, project memory, all the new project-management/diagnostic tools, project switching, context compression, and the full tool registry - about 120 individual checks. If anything fails, it prints exactly which check and why; copy that output if you need to report an issue.

## ⚠️ Safety notes

- The agent executes real actions (commits, pushes, direct edits on GitHub, file deletion). Check the plan (`/plan`) before approving anything sensitive.
- `git_push` uses `--force-with-lease` instead of a plain `--force` when a force push is requested, reducing the risk of clobbering someone else's work.
- `delete_path` refuses to delete a project's root directory or its `.devy-agent` folder.
- The token is only ever read from `.env` - never hardcode it or share it.
- If an edited file doesn't show up in `git status`/`git diff`, the agent is instructed to check `git_check_ignore` and confirm the actual repo root before assuming something is broken - a common cause of "the edit succeeded but git sees nothing".
