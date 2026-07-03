---
name: documentation
description: Generate, update, and maintain comprehensive project documentation including README, API docs, JSDoc/TSDoc, architecture diagrams, and changelogs.
allowed-tools: [write_file, edit_file, read_file, search_code, execute_command, detect_project, list_dir]
---
# Documentation Workflow

## Steps

1. **Scan project**: Use `detect_project` and `list_dir` to understand structure, language, and framework.
2. **Inventory existing docs**: Search for README.md, CHANGELOG.md, CONTRIBUTING.md, docs/, wiki/, and inline comments.
3. **README generation/update**:
   - Project title, badges (build status, license, version)
   - One-paragraph description
   - Features list
   - Quick start / installation instructions
   - Usage examples with code blocks
   - Configuration reference table
   - Contributing guidelines link
   - License
4. **API documentation**:
   - For REST APIs: Generate OpenAPI 3.0 YAML/JSON spec
   - For JS/TS: Add JSDoc/TSDoc comments to all exports (`@param`, `@returns`, `@example`, `@throws`)
   - For Python: Add Google-style docstrings to all public functions/classes
   - For CLI tools: Document all commands, flags, and options with examples
5. **Architecture documentation**:
   - Create `docs/architecture.md` with system overview
   - Add Mermaid diagrams for component relationships
   - Document data flow and state management
   - List external dependencies and their purposes
6. **Changelog maintenance**:
   - Follow Keep a Changelog format (keepachangelog.com)
   - Categories: Added, Changed, Deprecated, Removed, Fixed, Security
   - Link each version to git tags
7. **Contributing guide**:
   - Development setup instructions
   - Code style guide reference
   - Pull request process
   - Issue template descriptions
8. **Verify**: Ensure all code references are accurate, links work, and examples run.
