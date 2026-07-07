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
- **DAG-Based Planning**: Beyond linear lists, the agent utilizes a **Directed Acyclic Graph (DAG)** for complex orchestration. It calculates task dependencies, performs topological sorting, and identifies "ready" tasks for parallel execution.
- **Subagent Orchestration**: Ability to spawn multiple independent subagents in parallel via `spawn_subagents_parallel`. This allows the agent to tackle different modules of a project concurrently, merging results back into the main context via a structured tree.
- **Contextual Memory**: Durable project-level memory (`memory.md`) that persists across sessions, combined with a **Vector Store** for semantic codebase search.
- **Cognitive Scratchpad**: An explicit `think` tool for multi-step reasoning and strategy formulation before taking any irreversible action.
- **Adaptive Context**: Automatic context compression and tool-output truncation to maintain performance as conversation history grows.

### 🔌 Extensibility & Integration
- **Skill System**: A pluggable architecture where domain-specific expertise is encapsulated in `SKILL.md` files. Skills define specialized workflows and restricted toolsets for high-precision tasks (e.g., `code-review`, `debug-workflow`).
- **MCP Support**: Integration with the **Model Context Protocol (MCP)**, enabling the agent to connect to external tool servers and expand its capabilities dynamically.
- **Model Agnostic**: No hardcoded models. It detects installed Ollama models and allows session-based switching.

## 🏗️ Project Architecture

The agent is built with a modular, decoupled architecture:

- **`src/core`**: The brain of the agent. Contains the `Orchestrator`, `GraphPlanManager` (DAG logic), `SubagentManager` (parallelization), and `ContextManager`.
- **`src/tools`**: A comprehensive library of atomic capabilities, categorized by domain (Git, GitHub, Files, Web, etc.).
- **`src/skills`**: The skill registry and loader that transforms markdown-based instructions into executable agent workflows.
- **`src/ui`**: A rich CLI rendering engine providing real-time diffs, progress trackers, and subagent execution trees.
- **`src/llm`**: The interface layer for local LLM communication (primarily via Ollama).

## 🎓 The Skills System

Skills allow the agent to follow a proven methodology for specific types of work. 

### How it Works
Each skill is a directory containing a `SKILL.md` file with YAML frontmatter:
```markdown
---
name: "Code Review"
description: "Perform a professional audit of changes"
allowed-tools: ["git_diff", "read_file", "run_tests"]
---
# Instructions
1. Analyze the diff... 
2. Check for edge cases... 
```

### Custom Skills
You can add your own skills by creating a folder in `skills/` with a `SKILL.md` file. The agent will automatically discover and load them during the next session.

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
| `/plan` | Visualize current task progress and DAG dependencies |
| `/memory` | View or clear the persistent project memory |
| `/skills` | List all currently loaded specialized skills |
| `/reset` | Clear the current session context |
