---
name: performance-optimization
description: Profile, analyze, and optimize application performance including load times, memory usage, bundle size, and runtime efficiency.
allowed-tools: [read_file, search_code, execute_command, detect_project, tree_view, count_lines]
---
# Performance Optimization Workflow

## Steps

1. **Baseline measurement**: Use `execute_command` to run performance benchmarks, bundle analysis (webpack-bundle-analyzer, vite-plugin-inspect), or profiling tools.
2. **Bundle analysis** (frontend):
   - Check bundle size with `du -sh dist/` or build output
   - Identify large dependencies: `cat package.json` and cross-reference with bundlephobia
   - Look for duplicate dependencies
   - Check for tree-shaking opportunities (named imports vs namespace imports)
3. **Runtime analysis**:
   - Check for synchronous I/O in hot paths
   - Look for N+1 query patterns in database calls
   - Identify unnecessary re-renders (React) or watchers (Vue)
   - Check for memory leaks (event listeners not removed, growing arrays, unclosed streams)
4. **Optimization techniques**:
   - Code splitting and lazy loading for frontend
   - Image optimization (WebP, lazy loading, srcset)
   - Caching strategies (memoization, HTTP cache headers, service workers)
   - Database query optimization (indexes, query plans, connection pooling)
   - Compression (gzip/brotli for responses)
5. **Monitoring**: Add performance marks/measures or logging for ongoing tracking.
6. **Verify**: Re-run benchmarks to confirm improvement with concrete numbers.
