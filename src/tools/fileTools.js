'use strict';
const fs = require('fs');
const path = require('path');
const { resolveWithin } = require('../core/projectContext');

function buildFileTools(projectContext) {
  return {
    read_file: {
      description: 'Read a text file, optionally limited to a line range (offset/limit) for large files. This is the primary way to inspect file contents - prefer it over shell commands like cat.',
      params: { path: 'string (required)', offset: 'number (optional, first line number)', limit: 'number (optional, number of lines)' },
      handler: async ({ path: p, offset, limit }) => {
        try {
          if (!p) return { error: 'path is required. Please provide a valid file path.' };
          const full = resolveWithin(projectContext.dir, p);
          if (!fs.existsSync(full)) return { error: `File not found: ${p}` };
          if (fs.statSync(full).isDirectory()) return { error: `${p} is a directory, not a file. Use list_dir instead.` };
          const content = fs.readFileSync(full, 'utf8');
          const lines = content.split('\n');
          if (offset || limit) {
            const start = Math.max(0, (offset || 1) - 1);
            const end = limit ? start + Number(limit) : lines.length;
            const slice = lines.slice(start, end);
            return { content: slice.join('\n'), totalLines: lines.length, shown: `${start + 1}-${Math.min(end, lines.length)}` };
          }
          return { content, totalLines: lines.length };
        } catch (e) {
          return { error: `Could not read ${p}: ${e.message}` };
        }
      }
    },

    write_file: {
      description: 'Create a new file or overwrite an existing one entirely. This is the primary, preferred way to write file content - prefer it over a shell heredoc (cat > file << EOF) via execute_command, which is harder to verify and easier to get wrong. Only fall back to a shell heredoc if this tool genuinely fails for a specific file.',
      params: { path: 'string (required)', content: 'string (required)' },
      handler: async ({ path: p, content }) => {
        try {
          if (!p) return { error: 'path is required. Please provide a valid file path.' };
          const full = resolveWithin(projectContext.dir, p);
          if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return { error: `${p} is a directory, not a file. Cannot write to a directory.` };
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, content ?? '', 'utf8');
          return { success: true, path: p, bytes: Buffer.byteLength(content || '') };
        } catch (e) {
          return { error: `Could not write ${p}: ${e.message}` };
        }
      }
    },

    edit_file: {
      description: 'Precise edit: replace a specific existing block of text with new text inside a file (old_str must be unique and match exactly). This is the preferred way to make a targeted change - prefer it over rewriting a whole file or using sed/shell edits.',
      params: { path: 'string (required)', old_str: 'string (required)', new_str: 'string (required, empty to delete)' },
      handler: async ({ path: p, old_str, new_str }) => {
        try {
          if (!p) return { error: 'path is required. Please provide a valid file path.' };
          const full = resolveWithin(projectContext.dir, p);
          if (!fs.existsSync(full)) return { error: `File not found: ${p}` };
          if (fs.statSync(full).isDirectory()) return { error: `${p} is a directory, not a file. Use list_dir instead.` };
          const content = fs.readFileSync(full, 'utf8');
          const count = content.split(old_str).length - 1;
          if (count === 0) return { error: 'old_str was not found verbatim in the file. Re-read the file to get the exact current text before editing.' };
          if (count > 1) return { error: `old_str appears ${count} times in the file - it must be unique. Include more surrounding context to make it unique.` };
          const updated = content.replace(old_str, new_str ?? '');
          fs.writeFileSync(full, updated, 'utf8');
          return { success: true, path: p };
        } catch (e) {
          return { error: `Could not edit ${p}: ${e.message}` };
        }
      }
    },

    list_dir: {
      description: 'List the contents of a directory (files and folders) up to two levels deep, ignoring node_modules and .git',
      params: { path: 'string (optional, defaults to the active project root)' },
      handler: async ({ path: p } = {}) => {
        try {
          const full = resolveWithin(projectContext.dir, p || '.');
          if (!fs.existsSync(full)) return { error: `Path not found: ${p}` };
          const ignore = new Set(['node_modules', '.git']);
          function walk(dir, depth) {
            if (depth > 2) return [];
            return fs.readdirSync(dir, { withFileTypes: true })
              .filter((e) => !ignore.has(e.name))
              .map((e) => {
                const entryPath = path.join(dir, e.name);
                if (e.isDirectory()) {
                  return { name: e.name + '/', children: walk(entryPath, depth + 1) };
                }
                return { name: e.name };
              });
          }
          return { tree: walk(full, 0) };
        } catch (e) {
          return { error: `Could not list ${p || '.'}: ${e.message}` };
        }
      }
    },

    search_code: {
      description: 'Search project files for a text/regex pattern (like grep), returning file and line number. For finding files by name instead of content, use find_files.',
      params: { pattern: 'string (required, text or regex)', path: 'string (optional)', max_results: 'number (optional, default 50)' },
      handler: async ({ pattern, path: p, max_results = 50 }) => {
        try {
          const root = resolveWithin(projectContext.dir, p || '.');
          if (!fs.existsSync(root)) return { error: `Path not found: ${p || '.'}` };
          const ignore = new Set(['node_modules', '.git']);
          let regex;
          try { regex = new RegExp(pattern); } catch (_) { regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
          const results = [];

          const stat = fs.statSync(root);
          if (stat.isFile()) {
            try {
              const lines = fs.readFileSync(root, 'utf8').split('\n');
              lines.forEach((line, i) => {
                if (results.length < max_results && regex.test(line)) {
                  results.push({ file: path.relative(projectContext.dir, root), line: i + 1, text: line.trim().slice(0, 200) });
                }
              });
            } catch (_) {}
          } else {
            const walk = (dir) => {
              if (results.length >= max_results) return;
              for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (ignore.has(e.name) || e.name.startsWith('.')) continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); continue; }
                if (results.length >= max_results) return;
                try {
                  const lines = fs.readFileSync(full, 'utf8').split('\n');
                  lines.forEach((line, i) => {
                    if (results.length < max_results && regex.test(line)) {
                      results.push({ file: path.relative(projectContext.dir, full), line: i + 1, text: line.trim().slice(0, 200) });
                    }
                  });
                } catch (_) { /* likely a binary file, skip it */ }
              }
            };
            walk(root);
          }
          return { matches: results, count: results.length };
        } catch (e) {
          return { error: `Search failed: ${e.message}` };
        }
      }
    }
  };
}

module.exports = { buildFileTools };
