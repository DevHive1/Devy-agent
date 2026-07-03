'use strict';
const { normalizeOwnerRepo, explainGithubError, gh, ghHeaders } = require('./githubShared');

function b64encode(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}
function b64decode(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * GitHub REST API tools - use the token from config.github.token.
 * owner/repo: fall back to GITHUB_DEFAULT_OWNER/REPO when not passed explicitly.
 * Note: owner and repo should be passed as separate fields (not "owner/repo" combined,
 * and not a full URL) - but if that happens anyway, normalizeOwnerRepo() untangles it
 * as a safety net.
 */
function buildGithubTools(githubConfig) {
  const requireToken = () => {
    if (!githubConfig.token) throw new Error('GITHUB_TOKEN is not set. Add it to .env to use GitHub tools.');
    return githubConfig.token;
  };
  const ownerOf = (p) => normalizeOwnerRepo(p, githubConfig).owner;
  const repoOf = (p) => normalizeOwnerRepo(p, githubConfig).repo;
  const branchOf = (p) => p.branch || githubConfig.defaultBranch || 'main';

  return {
    gh_get_repo: {
      description: 'Get repository info (description, default branch, permissions...)',
      params: { owner: 'string', repo: 'string' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}`)
    },
    gh_create_repo: {
      description: 'Create a new repository under the authenticated user',
      params: { name: 'string (required)', private: 'boolean (optional)', description: 'string (optional)' },
      handler: async (p) => gh(requireToken(), 'POST', '/user/repos', { name: p.name, private: !!p.private, description: p.description })
    },
    gh_fork_repo: {
      description: 'Fork an existing repository',
      params: { owner: 'string', repo: 'string' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/forks`)
    },

    gh_list_contents: {
      description: 'List the contents of a directory in the repo directly from GitHub (no clone)',
      params: { owner: 'string', repo: 'string', path: 'string (optional, defaults to repo root)', branch: 'string (optional)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/contents/${p.path || ''}?ref=${branchOf(p)}`)
    },

    gh_get_file: {
      description: 'Read a file directly from GitHub (returns decoded content plus the sha needed to update it)',
      params: { owner: 'string', repo: 'string', path: 'string (required)', branch: 'string (optional)' },
      handler: async (p) => {
        const res = await gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/contents/${p.path}?ref=${branchOf(p)}`);
        if (res.error) return res;
        return { path: res.path, sha: res.sha, content: res.content ? b64decode(res.content) : '', size: res.size };
      }
    },

    gh_create_or_update_file: {
      description: 'Create or update a single file with a direct commit on GitHub, no clone needed (if the file already exists you must pass its current sha, from gh_get_file)',
      params: { owner: 'string', repo: 'string', path: 'string (required)', content: 'string (required, plain text, not base64)', message: 'string (required, commit message)', branch: 'string (optional)', sha: 'string (required only when updating an existing file)' },
      handler: async (p) => gh(requireToken(), 'PUT', `/repos/${ownerOf(p)}/${repoOf(p)}/contents/${p.path}`, {
        message: p.message,
        content: b64encode(p.content),
        branch: branchOf(p),
        ...(p.sha ? { sha: p.sha } : {})
      })
    },

    gh_delete_file: {
      description: 'Delete a file directly on GitHub (needs the file sha - use gh_get_file first)',
      params: { owner: 'string', repo: 'string', path: 'string (required)', sha: 'string (required)', message: 'string (required)', branch: 'string (optional)' },
      handler: async (p) => gh(requireToken(), 'DELETE', `/repos/${ownerOf(p)}/${repoOf(p)}/contents/${p.path}`, {
        message: p.message, sha: p.sha, branch: branchOf(p)
      })
    },

    gh_commit_multiple_files: {
      description: 'Create a single atomic commit that changes several files at once, directly on GitHub, no clone needed - preferred over repeated gh_create_or_update_file calls when files are related',
      params: {
        owner: 'string', repo: 'string', branch: 'string (optional)', message: 'string (required)',
        files: 'array (required) of { path, content } - use content: null to delete that file'
      },
      handler: async (p) => {
        const token = requireToken();
        const owner = ownerOf(p), repo = repoOf(p), branch = branchOf(p);
        if (!Array.isArray(p.files) || p.files.length === 0) return { error: true, message: '"files" must be a non-empty array of { path, content }.' };

        const refRes = await gh(token, 'GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
        if (refRes.error) return refRes;
        const baseCommitSha = refRes.object.sha;

        const commitRes = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
        if (commitRes.error) return commitRes;
        const baseTreeSha = commitRes.tree.sha;

        const treeEntries = [];
        for (const f of p.files) {
          if (f.content === null) {
            treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
            continue;
          }
          const blobRes = await gh(token, 'POST', `/repos/${owner}/${repo}/git/blobs`, { content: f.content, encoding: 'utf-8' });
          if (blobRes.error) return blobRes;
          treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: blobRes.sha });
        }

        const newTreeRes = await gh(token, 'POST', `/repos/${owner}/${repo}/git/trees`, { base_tree: baseTreeSha, tree: treeEntries });
        if (newTreeRes.error) return newTreeRes;

        const newCommitRes = await gh(token, 'POST', `/repos/${owner}/${repo}/git/commits`, {
          message: p.message, tree: newTreeRes.sha, parents: [baseCommitSha]
        });
        if (newCommitRes.error) return newCommitRes;

        const updateRefRes = await gh(token, 'PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: newCommitRes.sha });
        if (updateRefRes.error) return updateRefRes;

        return { success: true, commit_sha: newCommitRes.sha, files_changed: p.files.length, branch };
      }
    },

    gh_list_branches: {
      description: 'List all branches of the repository on GitHub',
      params: { owner: 'string', repo: 'string' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/branches`)
    },
    gh_create_branch: {
      description: 'Create a new branch on GitHub from an existing one (no clone needed)',
      params: { owner: 'string', repo: 'string', new_branch: 'string (required)', from_branch: 'string (optional, defaults to the default branch)' },
      handler: async (p) => {
        const token = requireToken();
        const owner = ownerOf(p), repo = repoOf(p);
        const fromRef = await gh(token, 'GET', `/repos/${owner}/${repo}/git/ref/heads/${p.from_branch || branchOf(p)}`);
        if (fromRef.error) return fromRef;
        return gh(token, 'POST', `/repos/${owner}/${repo}/git/refs`, { ref: `refs/heads/${p.new_branch}`, sha: fromRef.object.sha });
      }
    },

    gh_list_commits: {
      description: 'List recent commits on a given branch on GitHub',
      params: { owner: 'string', repo: 'string', branch: 'string (optional)', per_page: 'number (optional, default 10)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/commits?sha=${branchOf(p)}&per_page=${p.per_page || 10}`)
    },
    gh_compare_commits: {
      description: 'Compare two branches/commits on GitHub',
      params: { owner: 'string', repo: 'string', base: 'string (required)', head: 'string (required)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/compare/${p.base}...${p.head}`)
    },

    gh_create_pull_request: {
      description: 'Open a new Pull Request',
      params: { owner: 'string', repo: 'string', title: 'string (required)', head: 'string (required, source branch)', base: 'string (optional, defaults to the default branch)', body: 'string (optional)' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/pulls`, { title: p.title, head: p.head, base: p.base || branchOf(p), body: p.body || '' })
    },
    gh_list_pull_requests: {
      description: 'List Pull Requests (open by default)',
      params: { owner: 'string', repo: 'string', state: 'string (optional: open/closed/all)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/pulls?state=${p.state || 'open'}`)
    },
    gh_merge_pull_request: {
      description: 'Merge a Pull Request',
      params: { owner: 'string', repo: 'string', pull_number: 'number (required)', merge_method: 'string (optional: merge/squash/rebase)' },
      handler: async (p) => gh(requireToken(), 'PUT', `/repos/${ownerOf(p)}/${repoOf(p)}/pulls/${p.pull_number}/merge`, { merge_method: p.merge_method || 'squash' })
    },

    gh_create_issue: {
      description: 'Create a new issue',
      params: { owner: 'string', repo: 'string', title: 'string (required)', body: 'string (optional)' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/issues`, { title: p.title, body: p.body || '' })
    },
    gh_list_issues: {
      description: 'List issues (open by default)',
      params: { owner: 'string', repo: 'string', state: 'string (optional)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/issues?state=${p.state || 'open'}`)
    },
    gh_comment_issue: {
      description: 'Add a comment to an issue or pull request',
      params: { owner: 'string', repo: 'string', issue_number: 'number (required)', body: 'string (required)' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/issues/${p.issue_number}/comments`, { body: p.body })
    },

    gh_search_code: {
      description: 'Search code within a repo or across GitHub',
      params: { query: 'string (required)', owner: 'string (optional)', repo: 'string (optional)' },
      handler: async (p) => {
        const q = p.owner && p.repo ? `${p.query}+repo:${p.owner}/${p.repo}` : p.query;
        return gh(requireToken(), 'GET', `/search/code?q=${encodeURIComponent(q)}`);
      }
    }
  };
}

module.exports = { buildGithubTools };
