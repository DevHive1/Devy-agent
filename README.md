# 🤖 Devy Agent (git-agent-cli)

An autonomous, professional-grade CLI agent for Git, GitHub, and codebase engineering. Built on Node.js and designed for high-reliability local execution via **Ollama**, ensuring your code and data never leave your machine.

## ✨ Core Capabilities

### 🛠️ Massive Toolbelt (110+ Integrated Tools)
The agent operates using a sophisticated tool registry, allowing it to interact with your system with precision:
- **Filesystem Mastery**: Read, write, and precise block-editing (`edit_file`). Includes a directory tree visualizer and deep content search.
- **Project Management**: `make_dir`, `move_path`, `copy_path`, `delete_path`, and advanced glob-style `find_files`.
- **System Diagnostics**: `detect_project` (tech stack & manifest analysis), `run_tests` (auto-detects and executes test suites), and binary dependency verification.
- **Local Git Automation**: Complete implementation of the Git spec (init, add, commit, branch, merge, rebase, stash, bisect, reflog, etc.).
- **Remote GitHub API**: Edit repositories **directly via token without cloning**. Supports atomic multi-file commits, PR management, and Issue tracking.
- **GitHub Actions**: Full control over CI/CD workflows—trigger, cancel, inspect jobs, and pull logs/artifacts.
- **Terminal Access**: A secure `execute_command` sandbox for custom toolchains, installs, and dev-server management.

### 🧠 Advanced Intelligence Engine
- **Subagent Orchestration**: Ability to spawn multiple independent subagents in parallel via `spawn_subagents_parallel`, breaking complex goals into atomic sub-tasks with a built-in result caching system.
- **Contextual Memory**: Durable project-level memory (`memory.md`) that persists across sessions, combined with a **Vector Store** for semantic codebase search.
- **Autonomous Planning**: Integrated `PlanManager` that creates and updates structured task lists, ensuring the agent stays on track for complex migrations or feature builds.
- **Cognitive Scratchpad**: An explicit `think` tool for multi-step reasoning before taking action.
- **Adaptive Context**: Automatic context compression and tool-output truncation to maintain performance as conversation history grows.

### 🔌 Extensibility & Integration
- **Skill System**: A pluggable architecture allowing the agent to load specialized skills (e.g., `code-review`, `debug-workflow`, `backend-architecture`) for expert-level task execution.
- **MCP Support**: Integration with the **Model Context Protocol (MCP)**, enabling the agent to connect to external tool servers and expand its capabilities dynamically.
- **Model Agnostic**: No hardcoded models. It detects installed Ollama models and allows session-based switching.

## 📦 Installation (Termux / Linux / macOS)

```bash
pkg install nodejs-lts git -y  # Termux
# or use your system package manager for nodejs and git
cd git-agent-cli
npm install
```

Ensure Ollama is running:
```bash
ollama serve &
ollama pull qwen2.5-coder   # Recommended model
```

### Setup & Execution

**Option A: Local Run**
```bash
cp .env.example .env
node bin/agent.js chat
```

**Option B: Global Installation (Recommended)**
```bash
npm install -g .
# Setup global environment
mkdir -p ~/.devy-agent
cp .env.example ~/.devy-agent/.env
```
Now run from any directory: `devy-git chat`

**Environment Configuration (`.env`):**
```env
OLLAMA_HOST=http://localhost:11434
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_DEFAULT_OWNER=username
GITHUB_DEFAULT_REPO=repo-name
```

## 🚀 Usage Guide

### Interaction Modes
- **Interactive Chat**: `devy-git chat` (Best for complex engineering tasks).
- **Single Task**: `devy-git "refactor the auth logic in src/core and update tests"`
- **Pinned Session**: `devy-git --model qwen2.5-coder:7b --workspace ~/my-project chat`

### Power User Commands (Inside Chat)
| Command | Action |
|---|---|
| `/plan` | Visualize current task progress and strategy |
| `/model <name>` | Swap the active LLM on the fly |
| `/memory` | View/Edit the project's persistent knowledge base |
| `/project` | Identify and switch the active project directory |
| `/clear` | Reset conversation history without losing plan/memory |
| `Ctrl+C` | Interrupt the agent mid-step to provide feedback |

## 🗂️ Architecture Overview

```text
bin/agent.js             ➔ Entry point & CLI Command Processor
src/core/                ➔ Orchestrator, Subagent Manager, & Context Logic
src/tools/               ➔ Tool Registry (Files, Git, GitHub, Planning, etc.)
src/skills/              ➔ Specialized Domain Knowledge & Workflow Rules
src/mcp/                 ➔ Model Context Protocol Client
src/utils/               ➔ Vector Store, Logger, & Output Renderer
skills/                  ➔ Pre-defined Skill Modules (Architecture, Review, etc.)
<project>/.devy-agent/    ➔ Isolated State: plan.json, memory.md, chat.md
```

## 🩺 Reliability & Safety

- **Self-Diagnostic Suite**: Run `node scripts/selfcheck.js` to verify the entire toolchain, parser, and persistence layers.
- **Safe-Writes**: The agent prefers `edit_file` (precise replacement) over overwriting, preventing accidental data loss.
- **Git Guard**: Force-pushes are executed using `--force-with-lease` to protect remote history.
- **Sandbox Integrity**: `delete_path` is hard-coded to refuse deletion of project roots or the `.devy-agent` configuration folder.

## 🔑 GitHub Permissions
Required scopes for full functionality:
- **Classic**: `repo`, `workflow`
- **Fine-grained**: Contents (RW), Pull Requests (RW), Actions (RW), Workflows (RW)
