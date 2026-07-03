---
name: code-review
description: Perform a comprehensive review of the active directory or uncommitted git changes.
allowed-tools: [git_diff, read_file, execute_command, run_tests]
---
# Code Review Workflow

This skill helps review code quality, identify potential bugs, and ensure standard coding conventions before committing.

## Steps

1. **Get uncommitted diff**: Run `git_diff` or `git_diff` with `staged: true` to inspect the code changes.
2. **Review files**: For each modified file, inspect the changes. Check for:
   - Proper error handling
   - Code duplication or complexity issues
   - Compliance with existing style guides
   - Missing tests or outdated documentation
3. **Run diagnostics**: Use `run_tests` to verify if the changes break any existing test suite.
4. **Draft feedback**: List suggestions clearly, specifying the file names and lines where improvements can be made.
