---
name: "Performance Optimization"
description: "Identify runtime bottlenecks and optimize critical paths to improve application speed and resource efficiency."
allowed-tools: ["execute_command", "read_file", "edit_file", "run_tests", "search_code"]
---

# ⚡ Performance Optimization Workflow

This skill focuses on maximizing the efficiency of the codebase through data-driven optimization.

### 1. Profiling & Baseline Measurement
- Use `execute_command` to run profiling tools (e.g., Node.js `--inspect`, Chrome DevTools, or custom benchmarks) to identify "hot paths" and memory leaks.
- Establish a performance baseline by measuring execution time and resource usage for critical operations.

### 2. Bottleneck Analysis
- Use `read_file` and `search_code` to analyze the complexity (Time and Space) of the identified hot paths.
- Identify inefficient patterns such as redundant API calls, nested loops, or excessive object allocation.
- Use the `think` tool to brainstorm more efficient algorithms or data structures.

### 3. Targeted Optimization
- Apply optimizations using `edit_file`. Focus on high-impact changes first (e.g., caching, memoization, asynchronous processing).
- Ensure that optimizations do not compromise code readability or maintainability.

### 4. Verification & Benchmarking
- Re-run the profiling tools to measure the improvement against the baseline.
- Run the full test suite via `run_tests` to ensure that performance changes did not introduce functional regressions.

### 5. Optimization Report
- Document the before-and-after metrics in the project memory, explaining the optimization technique used and the resulting gain.
