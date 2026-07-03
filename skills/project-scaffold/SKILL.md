---
name: project-scaffold
description: Scaffold a standard web application or library structure based on tech stack auto-detection.
allowed-tools: [detect_project, make_dir, write_file, execute_command]
---
# Project Scaffold

This skill guides the scaffolding of standard boilerplate for new project directories.

## Steps

1. **Auto-detect tech stack**: If directory is not empty, run `detect_project` to check for any package manifests.
2. **Design directories**: Draft the directory layout (e.g. `src/`, `tests/`, `public/`, `docs/`).
3. **Create folder structure**: Call `make_dir` to set up directories without adding files.
4. **Scaffold boilerplate**:
   - Write standard config files (e.g. `.gitignore`, `README.md`, `.editorconfig`).
   - Scaffold entry files (e.g. `src/index.js` or `src/main.rs`).
5. **Install default tools**: Use `execute_command` to install linters or formatters if required by the workspace.
