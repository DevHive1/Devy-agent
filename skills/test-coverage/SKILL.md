---
name: test-coverage
description: Analyze existing test coverage, find untested paths, and write regression tests.
allowed-tools: [detect_project, run_tests, search_code, find_files, read_file, write_file, edit_file]
---
# Test Coverage Workflow

Identify gaps in test coverage and write targeted tests to cover untested functionality.

## Steps

1. **Locate manifests**: Run `detect_project` to locate tests and test runner scripts.
2. **Execute coverage**: Run the test suite with coverage enabled (e.g. `npm run test:coverage` or `pytest --cov`) using `run_tests` or `execute_command`.
3. **Analyze report**: Locate and inspect the coverage reports (HTML or text) to find source files with low coverage.
4. **Identify untested paths**: Use `read_file` on files with low coverage to find uncovered methods, logical branches, or exception handlers.
5. **Write tests**: Write new test cases in appropriate test files or create new test files using `write_file` or `edit_file`.
6. **Verify suite**: Re-run the tests to confirm they pass and improve the coverage percentage.
