---
name: "Architecture Evolution"
description: "Analyze technical debt and evolve the project structure to improve scalability and maintainability."
allowed-tools: ["tree_view", "search_code", "read_file", "edit_file", "move_path", "run_tests", "get_file_outline"]
---

# 🏗️ Architecture Evolution Workflow

This skill focuses on the long-term health and structural integrity of the codebase.

### 1. Structural Mapping
- Use `tree_view` and `get_file_outline` to build a mental map of the current architecture.
- Identify tightly coupled modules, "god objects", or circular dependencies using `search_code`.

### 2. Debt Identification
- Analyze the codebase for anti-patterns (e.g., duplication, lack of abstraction, inconsistent naming).
- Evaluate if the current structure supports the project's growth goals.
- Document the identified technical debt in the project memory.

### 3. Evolution Strategy
- Design a target architecture that resolves the identified issues.
- Create a phased migration plan (DAG) to move from the current state to the target state without breaking the system.
- Use the `think` tool to weigh the trade-offs of different architectural patterns.

### 4. Incremental Refactoring
- Execute the migration plan in small, verifiable steps.
- Use `move_path` for reorganizing files and `edit_file` for updating imports and logic.
- After every significant change, run the test suite via `run_tests` to ensure stability.

### 5. Validation & Documentation
- Verify that the new architecture improves the desired metrics (e.g., reduced complexity, better separation of concerns).
- Update the project documentation and memory to reflect the new architectural decisions.
