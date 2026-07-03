---
name: debug-workflow
description: Systematic process to reproduce, isolate, fix, and verify code bugs.
allowed-tools: [detect_project, run_tests, search_code, find_files, read_file, edit_file, execute_command]
---
# Debug Workflow

A structured procedure to troubleshoot and fix software defects.

## Steps

1. **Information gathering**: Read the bug description. Identify the affected area.
2. **Reproduce error**: Run tests using `run_tests` or execute a command/script via `execute_command` to get the error traceback.
3. **Isolate root cause**:
   - Use `find_files` or `search_code` to locate source files.
   - Use `read_file` to inspect the code context.
4. **Implement fix**: Use `edit_file` to make targeted changes. Do not replace entire files unless necessary.
5. **Verify repair**: Re-run the tests or reproduction command to confirm the bug is resolved.
