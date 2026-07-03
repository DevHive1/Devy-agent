'use strict';
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { resolveWithin } = require('../core/projectContext');

/** Translates a simple glob (*, **, ?) into a RegExp. No external dependency needed. */
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

function detectManifests(root) {
  const manifests = [];
  const check = (file, kind) => { if (fs.existsSync(path.join(root, file))) manifests.push({ kind, file }); };
  check('package.json', 'node');
  check('requirements.txt', 'python');
  check('pyproject.toml', 'python');
  check('Cargo.toml', 'rust');
  check('go.mod', 'go');
  check('pom.xml', 'java-maven');
  check('build.gradle', 'java-gradle');
  check('composer.json', 'php');
  check('Gemfile', 'ruby');
  return manifests;
}

function pickTestCommand(root) {
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test)) {
        return 'npm test';
      }
    } catch (_) { /* invalid package.json, fall through to other detectors */ }
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) return 'pytest';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo test';
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go test ./...';
  return null;
}

function buildProjectManagementTools(projectContext) {
  return {
    make_dir: {
      description: 'Create a directory (and any missing parent directories) without writing a file - use to scaffold a project structure before creating files in it',
      params: { path: 'string (required)' },
      handler: async ({ path: p }) => {
        try {
          const full = resolveWithin(projectContext.dir, p);
          fs.mkdirSync(full, { recursive: true });
          return { success: true, path: p };
        } catch (e) {
          return { error: `Could not create directory ${p}: ${e.message}` };
        }
      }
    },

    move_path: {
      description: 'Move or rename a file or directory within the active project - works even for paths not tracked by git yet (unlike git_mv, which requires the source to already be tracked)',
      params: { from: 'string (required)', to: 'string (required)' },
      handler: async ({ from, to }) => {
        try {
          const src = resolveWithin(projectContext.dir, from);
          const dest = resolveWithin(projectContext.dir, to);
          if (!fs.existsSync(src)) return { error: `Source not found: ${from}` };
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.renameSync(src, dest);
          return { success: true, from, to };
        } catch (e) {
          return { error: `Could not move ${from} to ${to}: ${e.message}` };
        }
      }
    },

    copy_path: {
      description: 'Copy a file or directory (recursively) within the active project',
      params: { from: 'string (required)', to: 'string (required)' },
      handler: async ({ from, to }) => {
        try {
          const src = resolveWithin(projectContext.dir, from);
          const dest = resolveWithin(projectContext.dir, to);
          if (!fs.existsSync(src)) return { error: `Source not found: ${from}` };
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.cpSync(src, dest, { recursive: true });
          return { success: true, from, to };
        } catch (e) {
          return { error: `Could not copy ${from} to ${to}: ${e.message}` };
        }
      }
    },

    delete_path: {
      description: 'Delete a file or directory within the active project. Irreversible - use thoughtfully. Set recursive: true to delete a non-empty directory',
      params: { path: 'string (required)', recursive: 'boolean (optional)' },
      handler: async ({ path: p, recursive }) => {
        try {
          const full = resolveWithin(projectContext.dir, p);
          const normalizedRoot = path.resolve(projectContext.dir);
          if (full === normalizedRoot) return { error: 'Refusing to delete the active project\'s root directory itself.' };
          if (path.basename(full) === '.devy-agent' && path.dirname(full) === normalizedRoot) {
            return { error: 'Refusing to delete the .devy-agent folder - the plan, memory, and chat history live there.' };
          }
          if (!fs.existsSync(full)) return { error: `Path not found: ${p}` };
          fs.rmSync(full, { recursive: !!recursive, force: false });
          return { success: true, path: p };
        } catch (e) {
          return { error: `Could not delete ${p}: ${e.message}` };
        }
      }
    },

    find_files: {
      description: 'Find files by filename/path pattern (glob-style: * within a segment, ** across directories, ? one character). A pattern with no "/" matches the filename anywhere in the tree; a pattern with "/" matches the full relative path. Use this to locate files by name - for searching file contents use search_code',
      params: { pattern: 'string (required), e.g. "*.test.ts" or "src/**/*.tsx"', path: 'string (optional)', max_results: 'number (optional, default 100)' },
      handler: async ({ pattern, path: p, max_results = 100 }) => {
        try {
          if (!pattern) return { error: 'Missing required "pattern".' };
          const root = resolveWithin(projectContext.dir, p || '.');
          if (!fs.existsSync(root)) return { error: `Path not found: ${p || '.'}` };
          const ignore = new Set(['node_modules', '.git']);
          const matchBasenameOnly = !pattern.includes('/');
          const regex = globToRegex(pattern);
          const results = [];
          function walk(dir) {
            if (results.length >= max_results) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              if (ignore.has(e.name) || e.name.startsWith('.')) continue;
              const full = path.join(dir, e.name);
              if (e.isDirectory()) { walk(full); continue; }
              if (results.length >= max_results) return;
              const rel = path.relative(projectContext.dir, full).split(path.sep).join('/');
              const target = matchBasenameOnly ? e.name : rel;
              if (regex.test(target)) results.push(rel);
            }
          }
          walk(root);
          return { files: results, count: results.length };
        } catch (e) {
          return { error: `find_files failed: ${e.message}` };
        }
      }
    },

    read_many_files: {
      description: 'Read several files in one call - more efficient than repeated read_file calls when you need multiple files at once. Max 20 files per call; for one very large file use read_file with offset/limit instead',
      params: { paths: 'array of strings (required), max 20' },
      handler: async ({ paths }) => {
        if (!Array.isArray(paths) || paths.length === 0) return { error: '"paths" must be a non-empty array of file paths.' };
        if (paths.length > 20) return { error: 'Too many paths in one call - max 20. Split into multiple calls.' };
        const files = {};
        for (const p of paths) {
          try {
            const full = resolveWithin(projectContext.dir, p);
            if (!fs.existsSync(full)) { files[p] = { error: 'not found' }; continue; }
            if (fs.statSync(full).isDirectory()) { files[p] = { error: 'is a directory' }; continue; }
            files[p] = { content: fs.readFileSync(full, 'utf8') };
          } catch (e) {
            files[p] = { error: e.message };
          }
        }
        return { files };
      }
    },

    file_info: {
      description: 'Get metadata about a file or directory (size, type, last modified, line count for text files) without reading its full content - useful reconnaissance before deciding whether/how to read something',
      params: { path: 'string (required)' },
      handler: async ({ path: p }) => {
        try {
          const full = resolveWithin(projectContext.dir, p);
          if (!fs.existsSync(full)) return { error: `Path not found: ${p}` };
          const stat = fs.statSync(full);
          const info = {
            path: p,
            type: stat.isDirectory() ? 'directory' : 'file',
            size_bytes: stat.size,
            modified: stat.mtime.toISOString()
          };
          if (!stat.isDirectory() && stat.size < 2 * 1024 * 1024) {
            try {
              info.line_count = fs.readFileSync(full, 'utf8').split('\n').length;
            } catch (_) {
              info.line_count = null; // likely a binary file
            }
          }
          return info;
        } catch (e) {
          return { error: `Could not stat ${p}: ${e.message}` };
        }
      }
    },

    detect_project: {
      description: 'Inspect a directory and report what kind of project it is (Node/Python/Rust/Go/Java/PHP/Ruby...), key manifest files, available npm scripts, and dependency counts. Use this before scaffolding into an unfamiliar directory, or before running tests/lint, to know what actually applies',
      params: { path: 'string (optional, defaults to the active project root)' },
      handler: async ({ path: p } = {}) => {
        try {
          const root = resolveWithin(projectContext.dir, p || '.');
          if (!fs.existsSync(root)) return { error: `Path not found: ${p || '.'}` };
          const manifests = detectManifests(root);
          const result = { path: p || '.', detected: manifests.map((m) => m.kind), manifests: manifests.map((m) => m.file) };
          const pkgPath = path.join(root, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              result.node = {
                name: pkg.name,
                version: pkg.version,
                scripts: pkg.scripts || {},
                dependency_count: Object.keys(pkg.dependencies || {}).length,
                dev_dependency_count: Object.keys(pkg.devDependencies || {}).length
              };
            } catch (e) {
              result.node = { error: `package.json is not valid JSON: ${e.message}` };
            }
          }
          if (manifests.length === 0) {
            result.note = 'No recognized project manifest found - likely an empty directory or an unsupported project type.';
          }
          return result;
        } catch (e) {
          return { error: `detect_project failed: ${e.message}` };
        }
      }
    },

    run_tests: {
      description: 'Detect and run this project\'s test suite (npm test / pytest / cargo test / go test), returning a structured pass/fail result with trimmed output - use after making changes to verify nothing broke, and to get concrete failure details when debugging',
      params: { path: 'string (optional)', command: 'string (optional, overrides auto-detection)', timeout_ms: 'number (optional, default 120000)' },
      handler: async ({ path: p, command, timeout_ms = 120000 } = {}) => {
        const root = path.resolve(projectContext.dir, p || '.');
        if (!fs.existsSync(root)) return { error: `Path not found: ${p || '.'}` };
        const cmd = command || pickTestCommand(root);
        if (!cmd) {
          return { error: 'Could not auto-detect a test command for this project. Pass "command" explicitly, or run it with execute_command.', command_used: null };
        }
        return new Promise((resolve) => {
          exec(cmd, { cwd: root, timeout: timeout_ms, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            const combined = `${(stdout || '').toString()}\n${(stderr || '').toString()}`;
            const tail = combined.split('\n').slice(-80).join('\n');
            resolve({
              command_used: cmd,
              exit_code: err ? (err.code ?? 1) : 0,
              passed: !err,
              output_tail: tail
            });
          });
        });
      }
    },

    check_tool_installed: {
      description: 'Check whether a command-line tool/binary (node, npm, python, cargo, docker...) is available in PATH - use before running a command that would otherwise fail with a confusing "command not found"',
      params: { binary: 'string (required)' },
      handler: async ({ binary }) => {
        if (!binary || /[/\\;&|]/.test(binary)) return { error: 'Invalid binary name.' };
        return new Promise((resolve) => {
          execFile('which', [binary], (err, stdout) => {
            if (err) return resolve({ installed: false, binary });
            resolve({ installed: true, binary, path: stdout.toString().trim() });
          });
        });
      }
    }
  };
}

module.exports = { buildProjectManagementTools };
