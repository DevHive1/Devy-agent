'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function runGit(args, cwd) {
  return new Promise((resolve) => {
    if (!fs.existsSync(cwd)) {
      return resolve({ exit_code: 1, stdout: '', stderr: `Directory not found: ${cwd}` });
    }
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') {
        return resolve({ exit_code: 127, stdout: '', stderr: 'git is not installed or not found in PATH. Install git and try again.' });
      }
      resolve({
        exit_code: err ? (err.code ?? 1) : 0,
        stdout: (stdout || '').toString().trim(),
        stderr: (stderr || '').toString().trim()
      });
    });
  });
}

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Compact command table: each tool = name + description + args builder for the git CLI.
 * This keeps the code DRY instead of a separate handler per command.
 */
const GIT_COMMANDS = {
  git_init: { desc: 'Initialize a new git repository in the current directory', build: () => ['init'] },
  git_clone: {
    desc: 'Clone a repository from a URL into a local directory (optional) inside the active project',
    build: (p) => ['clone', ...(p.branch ? ['-b', p.branch] : []), p.url, ...(p.dir ? [p.dir] : [])]
  },
  git_status: { desc: 'Show the status of modified/new/staged files', build: () => ['status', '--porcelain=v1', '-b'] },
  git_add: { desc: 'Stage files for commit', build: (p) => ['add', ...arr(p.paths || p.path || '.')] },
  git_restore: { desc: 'Restore files from the index or a given commit (discard changes)', build: (p) => ['restore', ...(p.staged ? ['--staged'] : []), ...(p.source ? ['--source', p.source] : []), ...arr(p.paths)] },
  git_rm: { desc: 'Remove files from the repo and the working tree', build: (p) => ['rm', ...(p.cached ? ['--cached'] : []), ...arr(p.paths)] },
  git_mv: { desc: 'Move/rename a file with git tracking', build: (p) => ['mv', p.from, p.to] },
  git_commit: { desc: 'Record staged changes as a new commit', build: (p) => ['commit', '-m', p.message, ...(p.all ? ['-a'] : []), ...(p.amend ? ['--amend'] : [])] },
  git_branch: { desc: 'List/create/delete branches', build: (p) => ['branch', ...(p.delete ? ['-d', p.name] : p.name ? [p.name] : ['-a'])] },
  git_checkout: { desc: 'Switch branch, create a new branch, or restore a file from a commit', build: (p) => ['checkout', ...(p.create ? ['-b', p.branch] : []), ...(!p.create && p.branch ? [p.branch] : []), ...arr(p.paths)] },
  git_switch: { desc: 'Switch the current branch (modern alternative to checkout)', build: (p) => ['switch', ...(p.create ? ['-c'] : []), p.branch] },
  git_merge: { desc: 'Merge another branch into the current one', build: (p) => ['merge', ...(p.no_ff ? ['--no-ff'] : []), ...(p.abort ? ['--abort'] : [p.branch])] },
  git_rebase: { desc: 'Rebase the current branch onto another branch', build: (p) => ['rebase', ...(p.abort ? ['--abort'] : p.continue ? ['--continue'] : [p.onto || p.branch])] },
  git_reset: { desc: 'Reset HEAD/the index (soft/mixed/hard)', build: (p) => ['reset', `--${p.mode || 'mixed'}`, p.ref || 'HEAD'] },
  git_revert: { desc: 'Create a new commit that reverses a previous commit', build: (p) => ['revert', ...(p.no_edit !== false ? ['--no-edit'] : []), p.commit] },
  git_cherry_pick: { desc: 'Apply the changes from a specific commit onto the current branch', build: (p) => ['cherry-pick', ...(p.abort ? ['--abort'] : [p.commit])] },
  git_tag: { desc: 'List/create/delete tags', build: (p) => ['tag', ...(p.delete ? ['-d', p.name] : p.name ? (p.message ? ['-a', p.name, '-m', p.message] : [p.name]) : [])] },
  git_fetch: { desc: 'Fetch updates from a remote without merging', build: (p) => ['fetch', p.remote || 'origin', ...(p.prune ? ['--prune'] : [])] },
  git_pull: { desc: 'Fetch and merge updates from a remote', build: (p) => ['pull', ...(p.rebase ? ['--rebase'] : []), p.remote || 'origin', p.branch || ''].filter(Boolean) },
  git_push: { desc: 'Push commits to the remote (make sure the token has push access if the remote is https)', build: (p) => ['push', ...(p.force ? ['--force-with-lease'] : []), ...(p.set_upstream ? ['-u'] : []), p.remote || 'origin', p.branch || ''].filter(Boolean) },
  git_remote: { desc: 'List/add/remove remotes', build: (p) => p.add ? ['remote', 'add', p.name, p.url] : p.remove ? ['remote', 'remove', p.name] : ['remote', '-v'] },
  git_submodule: { desc: 'Manage submodules (init/update/add)', build: (p) => ['submodule', p.action || 'status', ...(p.url ? [p.url] : []), ...(p.path ? [p.path] : [])] },
  git_log: { desc: 'Show commit history (compact by default to save context)', build: (p) => ['log', `--max-count=${p.limit || 15}`, '--oneline', ...(p.graph ? ['--graph'] : []), ...(p.path ? ['--', p.path] : [])] },
  git_show: { desc: 'Show details of a specific commit/object', build: (p) => ['show', p.ref || 'HEAD', ...(p.stat ? ['--stat'] : [])] },
  git_diff: { desc: 'Show differences between working tree/staged/commits', build: (p) => ['diff', ...(p.staged ? ['--staged'] : []), ...(p.commit1 ? [p.commit1] : []), ...(p.commit2 ? [p.commit2] : []), ...(p.path ? ['--', p.path] : [])] },
  git_range_diff: { desc: 'Compare two commit ranges (useful after a rebase)', build: (p) => ['range-diff', p.range1, p.range2] },
  git_shortlog: { desc: 'Summarize commits grouped by author', build: () => ['shortlog', '-sn'] },
  git_describe: { desc: 'Name the current commit based on the nearest tag', build: () => ['describe', '--tags', '--always'] },
  git_blame: { desc: 'Show which commit last changed each line of a file', build: (p) => ['blame', '--line-porcelain', p.path].filter(Boolean) },
  git_apply: { desc: 'Apply a patch file to the working tree', build: (p) => ['apply', ...(p.check ? ['--check'] : []), p.patch_path] },
  git_am: { desc: 'Apply mailbox-format patches as commits', build: (p) => ['am', p.patch_path] },
  git_format_patch: { desc: 'Generate patch files from commits', build: (p) => ['format-patch', p.range || '-1', ...(p.output_dir ? ['-o', p.output_dir] : [])] },
  git_bisect: { desc: 'Binary-search for the commit that introduced a bug (start/good/bad/reset)', build: (p) => ['bisect', p.action || 'status', ...(p.ref ? [p.ref] : [])] },
  git_archive: { desc: 'Export the file tree as an archive (zip/tar)', build: (p) => ['archive', `--format=${p.format || 'zip'}`, '-o', p.output, p.ref || 'HEAD'] },
  git_clean: { desc: 'Remove untracked files from the working tree', build: (p) => ['clean', p.dry_run === false ? '-fd' : '-ndf'] },
  git_gc: { desc: 'Clean up and optimize the repository database', build: () => ['gc', '--auto'] },
  git_fsck: { desc: 'Check the integrity of repository objects', build: () => ['fsck'] },
  git_reflog: { desc: 'Show the history of HEAD movements (useful to recover lost commits)', build: () => ['reflog', '--max-count=30'] },
  git_stash: { desc: 'Save/restore/list temporary changes (list/push/pop/apply/drop)', build: (p) => ['stash', p.action || 'list', ...(p.action === 'push' && p.message ? ['-m', p.message] : []), ...(p.stash_ref ? [p.stash_ref] : [])] },
  git_worktree: { desc: 'Manage multiple working trees for the same repo', build: (p) => ['worktree', p.action || 'list', ...(p.path ? [p.path] : []), ...(p.branch ? [p.branch] : [])] },
  git_grep: { desc: 'Search tracked files for a text pattern', build: (p) => ['grep', '-n', p.pattern] },
  git_ls_files: { desc: 'List files tracked in the index', build: () => ['ls-files'] },
  git_ls_remote: { desc: 'List refs on a remote without fetching data', build: (p) => ['ls-remote', p.remote || 'origin'] },
  git_rev_parse: { desc: 'Resolve a ref name to a SHA, or query repo info (e.g. ref: "--show-toplevel" to find the repo root)', build: (p) => ['rev-parse', p.ref || 'HEAD'] },
  git_cherry: { desc: 'Show commits in one branch that are missing from another', build: (p) => ['cherry', p.upstream || 'main', p.branch || 'HEAD'] },
  git_show_ref: { desc: 'List all local and remote refs', build: () => ['show-ref'] },
  git_merge_base: { desc: 'Find the closest common ancestor commit between two refs', build: (p) => ['merge-base', p.ref1, p.ref2] },
  git_count_objects: { desc: 'Show the size and count of repository objects', build: () => ['count-objects', '-v'] },
  git_config: { desc: 'Read/set git config values (e.g. user.name/email)', build: (p) => p.value ? ['config', p.key, p.value] : ['config', '--get', p.key] },
  git_check_ignore: { desc: 'Check whether given path(s) are excluded by .gitignore rules - use this to diagnose why an edited/new file is not showing up in git_status or git_diff', build: (p) => ['check-ignore', '-v', ...arr(p.paths)] }
};

function buildGitTools(projectContext) {
  const tools = {};

  for (const [name, def] of Object.entries(GIT_COMMANDS)) {
    tools[name] = {
      description: def.desc,
      params: { '...': 'see the tool description - parameters vary per command', repo_dir: 'string (optional, repo path relative to the active project, defaults to its root)' },
      handler: async (params = {}) => {
        const cwd = path.resolve(projectContext.dir, params.repo_dir || '.');
        const args = def.build(params);
        return runGit(args, cwd);
      }
    };
  }

  // General-purpose fallback tool for any git command/option not covered above (rare plumbing commands)
  tools.git_raw = {
    description: 'Run any git command directly with a raw args array - only use this for a command/option not available in the other tools',
    params: { args: 'array of strings (required), e.g. ["log", "--stat", "-3"]', repo_dir: 'string (optional)' },
    handler: async ({ args, repo_dir }) => {
      const cwd = path.resolve(projectContext.dir, repo_dir || '.');
      return runGit(arr(args), cwd);
    }
  };

  return tools;
}

module.exports = { buildGitTools, runGit };
