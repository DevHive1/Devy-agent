---
name: "Self-Healing"
description: "Automatically detect, isolate, and fix regressions or bugs based on test failures."
allowed-tools: ["run_tests", "read_file", "edit_file", "execute_command", "git_status", "search_code"]
---

# 🛠️ Self-Healing Workflow

This skill transforms the agent into an autonomous repair system. Follow these steps strictly:

### 1. Detection & Reproduction
- Execute the test suite using `run_tests` to identify failing cases.
- If no tests exist, use `execute_command` to run the application and capture logs/stack traces.
- Isolate the minimum set of steps required to reproduce the failure.

### 2. Root Cause Analysis (RCA)
- Use `search_code` and `read_file` to trace the execution path from the failure point back to the source of the bug.
- Analyze the state of variables and logic flow. Use the `think` tool to hypothesize the cause.
- Verify the hypothesis by adding temporary debug logs or targeted test cases.

### 3. Targeted Remediation
- Design a fix that resolves the root cause without introducing regressions.
- Apply the fix using `edit_file` for precise changes.
- Ensure the fix adheres to the project's existing coding conventions.

### 4. Verification & Regression Testing
- Re-run the failing tests to confirm the fix works.
- Run the full test suite to ensure no other parts of the system were broken.
- If the fix is complex, write a new regression test that specifically targets this bug to prevent it from returning.

### 5. Finalization
- Clean up any debug logs or temporary files.
- Document the fix in the project memory (`memory_append`).
