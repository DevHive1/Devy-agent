'use strict';
const fs = require('fs');
const path = require('path');
const { resolveWithin } = require('../core/projectContext');

/**
 * Advanced local tools — enhanced file operations, batch edits, code analysis.
 */
function buildAdvancedFileTools(projectContext) {
  return {
    multi_edit_file: {
      description: 'Apply multiple non-overlapping edits to a file in one call. Each edit is an {old_str, new_str} pair applied sequentially from bottom to top to avoid offset drift.',
      params: {
        path: 'string (required)',
        edits: 'array of {old_str, new_str} (required)'
      },
      handler: async ({ path: p, edits }) => {
        try {
          if (!p) return { error: 'Missing required: "path"' };
          if (!Array.isArray(edits) || edits.length === 0) return { error: '"edits" must be a non-empty array of {old_str, new_str}' };
          const full = resolveWithin(projectContext.dir, p);
          if (!fs.existsSync(full)) return { error: `File not found: ${p}` };
          let content = fs.readFileSync(full, 'utf8');
          const applied = [];
          const failed = [];
          // Process edits in reverse order of their position to avoid offset issues
          const positioned = edits.map((e, i) => ({ ...e, idx: i, pos: content.indexOf(e.old_str) }));
          positioned.sort((a, b) => b.pos - a.pos);
          for (const edit of positioned) {
            const count = content.split(edit.old_str).length - 1;
            if (count === 0) { failed.push({ idx: edit.idx, error: 'old_str not found' }); continue; }
            if (count > 1) { failed.push({ idx: edit.idx, error: `old_str appears ${count} times — must be unique` }); continue; }
            content = content.replace(edit.old_str, edit.new_str ?? '');
            applied.push(edit.idx);
          }
          fs.writeFileSync(full, content, 'utf8');
          return { success: true, path: p, applied: applied.length, failed };
        } catch (e) {
          return { error: `multi_edit_file failed: ${e.message}` };
        }
      }
    },

    replace_in_files: {
      description: 'Find and replace a pattern across multiple files in a directory. Supports regex. Returns count of files and replacements made.',
      params: {
        pattern: 'string (required, text or regex)',
        replacement: 'string (required)',
        path: 'string (optional, directory to search)',
        file_pattern: 'string (optional, glob for file names, e.g. "*.js")',
        dry_run: 'boolean (optional, default false)'
      },
      handler: async ({ pattern, replacement, path: p, file_pattern, dry_run = false }) => {
        try {
          if (!pattern) return { error: 'Missing required: "pattern"' };
          if (replacement === undefined) return { error: 'Missing required: "replacement"' };
          const root = resolveWithin(projectContext.dir, p || '.');
          const ignore = new Set(['node_modules', '.git', 'dist', 'build']);
          let regex;
          try { regex = new RegExp(pattern, 'g'); } catch (_) { regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); }
          let fileGlob = null;
          if (file_pattern) {
            const gp = file_pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
            fileGlob = new RegExp('^' + gp + '$');
          }
          const results = [];
          let totalReplacements = 0;
          function walk(dir) {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              if (ignore.has(e.name)) continue;
              const full = path.join(dir, e.name);
              if (e.isDirectory()) { walk(full); continue; }
              if (fileGlob && !fileGlob.test(e.name)) continue;
              try {
                const content = fs.readFileSync(full, 'utf8');
                const matches = content.match(regex);
                if (!matches || matches.length === 0) continue;
                const count = matches.length;
                totalReplacements += count;
                const rel = path.relative(projectContext.dir, full);
                if (!dry_run) {
                  const updated = content.replace(regex, replacement);
                  fs.writeFileSync(full, updated, 'utf8');
                }
                results.push({ file: rel, replacements: count });
              } catch (_) {}
            }
          }
          walk(root);
          return { files_affected: results.length, total_replacements: totalReplacements, dry_run, results };
        } catch (e) {
          return { error: `replace_in_files failed: ${e.message}` };
        }
      }
    },

    compare_files: {
      description: 'Compare two files and show the differences line-by-line. Useful for reviewing changes before committing.',
      params: { file_a: 'string (required)', file_b: 'string (required)' },
      handler: async ({ file_a, file_b }) => {
        try {
          if (!file_a || !file_b) return { error: 'Both "file_a" and "file_b" are required.' };
          const fullA = resolveWithin(projectContext.dir, file_a);
          const fullB = resolveWithin(projectContext.dir, file_b);
          if (!fs.existsSync(fullA)) return { error: `File not found: ${file_a}` };
          if (!fs.existsSync(fullB)) return { error: `File not found: ${file_b}` };
          const linesA = fs.readFileSync(fullA, 'utf8').split('\n');
          const linesB = fs.readFileSync(fullB, 'utf8').split('\n');
          const diffs = [];
          const maxLen = Math.max(linesA.length, linesB.length);
          for (let i = 0; i < maxLen; i++) {
            if (linesA[i] !== linesB[i]) {
              diffs.push({ line: i + 1, a: linesA[i] !== undefined ? linesA[i] : null, b: linesB[i] !== undefined ? linesB[i] : null });
            }
          }
          return { file_a, file_b, lines_a: linesA.length, lines_b: linesB.length, differences: diffs.length, diffs: diffs.slice(0, 100) };
        } catch (e) {
          return { error: `compare_files failed: ${e.message}` };
        }
      }
    },

    tree_view: {
      description: 'Show a visual tree of the project directory structure with optional depth limit and filtering. More detailed than list_dir.',
      params: {
        path: 'string (optional)',
        depth: 'number (optional, default 4)',
        show_files: 'boolean (optional, default true)',
        show_hidden: 'boolean (optional, default false)',
        extensions: 'string (optional, comma-separated filter e.g. "js,ts")'
      },
      handler: async ({ path: p, depth = 4, show_files = true, show_hidden = false, extensions } = {}) => {
        try {
          const root = resolveWithin(projectContext.dir, p || '.');
          if (!fs.existsSync(root)) return { error: `Path not found: ${p || '.'}` };
          const ignore = new Set(['node_modules', '.git', '__pycache__', '.DS_Store']);
          const extFilter = extensions ? new Set(extensions.split(',').map(e => '.' + e.trim())) : null;
          const lines = [];
          let fileCount = 0, dirCount = 0;

          function walk(dir, prefix, currentDepth) {
            if (currentDepth > depth) return;
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
            if (!show_hidden) entries = entries.filter(e => !e.name.startsWith('.') || !ignore.has(e.name));
            entries = entries.filter(e => !ignore.has(e.name));
            entries.sort((a, b) => {
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            });

            entries.forEach((e, i) => {
              const isLast = i === entries.length - 1;
              const connector = isLast ? '└── ' : '├── ';
              const childPrefix = isLast ? '    ' : '│   ';
              const full = path.join(dir, e.name);
              if (e.isDirectory()) {
                dirCount++;
                lines.push(`${prefix}${connector}${e.name}/`);
                walk(full, prefix + childPrefix, currentDepth + 1);
              } else if (show_files) {
                if (extFilter && !extFilter.has(path.extname(e.name))) return;
                fileCount++;
                const size = fs.statSync(full).size;
                const sizeStr = size < 1024 ? `${size}B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)}K` : `${(size / 1024 / 1024).toFixed(1)}M`;
                lines.push(`${prefix}${connector}${e.name} (${sizeStr})`);
              }
            });
          }

          const rootName = path.basename(root);
          lines.unshift(`${rootName}/`);
          walk(root, '', 0);
          return { tree: lines.join('\n'), directories: dirCount, files: fileCount };
        } catch (e) {
          return { error: `tree_view failed: ${e.message}` };
        }
      }
    },

    count_lines: {
      description: 'Count lines of code across the project, grouped by file extension. Excludes node_modules, .git, and common build directories.',
      params: { path: 'string (optional)', extensions: 'string (optional, comma-separated)' },
      handler: async ({ path: p, extensions } = {}) => {
        try {
          const root = resolveWithin(projectContext.dir, p || '.');
          const ignore = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'coverage']);
          const extFilter = extensions ? new Set(extensions.split(',').map(e => '.' + e.trim())) : null;
          const stats = {};
          let totalFiles = 0, totalLines = 0;

          function walk(dir) {
            try {
              for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (ignore.has(e.name)) continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); continue; }
                const ext = path.extname(e.name) || '(none)';
                if (extFilter && !extFilter.has(ext)) continue;
                try {
                  const lines = fs.readFileSync(full, 'utf8').split('\n').length;
                  if (!stats[ext]) stats[ext] = { files: 0, lines: 0 };
                  stats[ext].files++;
                  stats[ext].lines += lines;
                  totalFiles++;
                  totalLines += lines;
                } catch (_) {}
              }
            } catch (_) {}
          }

          walk(root);
          const sorted = Object.entries(stats).sort((a, b) => b[1].lines - a[1].lines);
          return { total_files: totalFiles, total_lines: totalLines, by_extension: Object.fromEntries(sorted) };
        } catch (e) {
          return { error: `count_lines failed: ${e.message}` };
        }
      }
    },

    lint_check: {
      description: 'Run a quick lint/syntax check on a file. Supports JavaScript (node --check), Python (py_compile), and JSON (JSON.parse).',
      params: { path: 'string (required)' },
      handler: async ({ path: p }) => {
        try {
          const full = resolveWithin(projectContext.dir, p);
          if (!fs.existsSync(full)) return { error: `File not found: ${p}` };
          const ext = path.extname(full);
          if (ext === '.json') {
            try { JSON.parse(fs.readFileSync(full, 'utf8')); return { valid: true, path: p, type: 'json' }; }
            catch (e) { return { valid: false, path: p, type: 'json', error: e.message }; }
          }
          if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
            const { execSync } = require('child_process');
            try { execSync(`node --check "${full}"`, { stdio: 'pipe', timeout: 10000 }); return { valid: true, path: p, type: 'javascript' }; }
            catch (e) { return { valid: false, path: p, type: 'javascript', error: e.stderr?.toString().trim() || e.message }; }
          }
          if (ext === '.py') {
            const { execSync } = require('child_process');
            try { execSync(`python3 -m py_compile "${full}"`, { stdio: 'pipe', timeout: 10000 }); return { valid: true, path: p, type: 'python' }; }
            catch (e) { return { valid: false, path: p, type: 'python', error: e.stderr?.toString().trim() || e.message }; }
          }
          return { valid: null, path: p, note: `No lint checker for ${ext} files. Use execute_command to run your linter.` };
        } catch (e) {
          return { error: `lint_check failed: ${e.message}` };
        }
      }
    }
  };
}

module.exports = { buildAdvancedFileTools };
