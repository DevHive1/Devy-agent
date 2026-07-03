---
name: scaffolder
description: Scaffold new projects, modules, components, and boilerplate from templates. Supports Node.js, Python, React, Vue, Express, FastAPI, and more.
allowed-tools: [write_file, edit_file, read_file, execute_command, detect_project, list_dir]
---
# Project Scaffolder Workflow

## Steps

1. **Determine target**: Ask or infer what needs scaffolding — full project, module, component, API endpoint, test suite.
2. **Detect existing conventions**: Use `detect_project` and scan for existing patterns (naming, structure, imports).
3. **Project scaffolding**:
   - Node.js: Create package.json, src/, tests/, .gitignore, .eslintrc, README.md
   - Python: Create pyproject.toml or setup.py, src/<pkg>/, tests/, .gitignore, requirements.txt
   - React: Create component structure (Component.jsx, Component.css, Component.test.jsx, index.js barrel)
   - Express API: Create routes/, controllers/, middleware/, models/, config/, app.js
   - FastAPI: Create app/, routers/, models/, schemas/, main.py
4. **Module scaffolding**:
   - Create module directory with index file
   - Add proper exports (CommonJS or ESM based on project)
   - Create corresponding test file
   - Update barrel exports if applicable
5. **Component scaffolding** (frontend):
   - Component file with proper template/JSX
   - Stylesheet (CSS Modules, Styled Components, or Tailwind based on project)
   - Test file with basic render test
   - Story file if Storybook is present
6. **API endpoint scaffolding**:
   - Route handler with validation
   - Controller with business logic
   - Model/schema if database-backed
   - Integration test
   - OpenAPI spec update
7. **Post-scaffold**: Run lint/format commands, verify imports resolve, ensure tests pass.
