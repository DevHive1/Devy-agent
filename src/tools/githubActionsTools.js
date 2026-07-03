'use strict';
const { normalizeOwnerRepo, gh, ghHeaders } = require('./githubShared');

function buildGithubActionsTools(githubConfig) {
  const requireToken = () => {
    if (!githubConfig.token) throw new Error('GITHUB_TOKEN is not set. Add it to .env to use GitHub Actions tools.');
    return githubConfig.token;
  };
  const ownerOf = (p) => normalizeOwnerRepo(p, githubConfig).owner;
  const repoOf = (p) => normalizeOwnerRepo(p, githubConfig).repo;

  return {
    gh_actions_list_workflows: {
      description: 'List all workflows in the repository',
      params: { owner: 'string', repo: 'string' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/workflows`)
    },
    gh_actions_get_workflow: {
      description: 'Get details of a specific workflow (by id or filename, e.g. ci.yml)',
      params: { owner: 'string', repo: 'string', workflow_id: 'string|number (required)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/workflows/${p.workflow_id}`)
    },
    gh_actions_enable_workflow: {
      description: 'Enable a workflow',
      params: { owner: 'string', repo: 'string', workflow_id: 'string|number (required)' },
      handler: async (p) => gh(requireToken(), 'PUT', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/workflows/${p.workflow_id}/enable`)
    },
    gh_actions_disable_workflow: {
      description: 'Disable a workflow',
      params: { owner: 'string', repo: 'string', workflow_id: 'string|number (required)' },
      handler: async (p) => gh(requireToken(), 'PUT', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/workflows/${p.workflow_id}/disable`)
    },
    gh_actions_trigger_workflow: {
      description: 'Trigger a workflow_dispatch run (the workflow file must declare on: workflow_dispatch)',
      params: { owner: 'string', repo: 'string', workflow_id: 'string|number (required)', ref: 'string (required, branch name)', inputs: 'object (optional)' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/workflows/${p.workflow_id}/dispatches`, { ref: p.ref, inputs: p.inputs || {} })
    },

    gh_actions_list_runs: {
      description: 'List recent workflow runs in the repo, optionally filtered by workflow or status',
      params: { owner: 'string', repo: 'string', workflow_id: 'string|number (optional)', status: 'string (optional: queued/in_progress/completed)', per_page: 'number (optional)' },
      handler: async (p) => {
        const base = p.workflow_id ? `/repos/${ownerOf(p)}/${repoOf(p)}/actions/workflows/${p.workflow_id}/runs` : `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs`;
        const qs = new URLSearchParams();
        if (p.status) qs.set('status', p.status);
        qs.set('per_page', p.per_page || 15);
        return gh(requireToken(), 'GET', `${base}?${qs}`);
      }
    },
    gh_actions_get_run: {
      description: 'Get details of a specific workflow run',
      params: { owner: 'string', repo: 'string', run_id: 'number (required)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}`)
    },
    gh_actions_cancel_run: {
      description: 'Cancel an in-progress workflow run',
      params: { owner: 'string', repo: 'string', run_id: 'number (required)' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}/cancel`)
    },
    gh_actions_rerun_run: {
      description: 'Re-run a failed workflow run (all jobs, or only the failed ones)',
      params: { owner: 'string', repo: 'string', run_id: 'number (required)', failed_only: 'boolean (optional)' },
      handler: async (p) => gh(requireToken(), 'POST', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}/${p.failed_only ? 'rerun-failed-jobs' : 'rerun'}`)
    },
    gh_actions_delete_run: {
      description: 'Delete an old workflow run record',
      params: { owner: 'string', repo: 'string', run_id: 'number (required)' },
      handler: async (p) => gh(requireToken(), 'DELETE', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}`)
    },

    gh_actions_list_jobs: {
      description: 'List the jobs inside a workflow run, with the status of each',
      params: { owner: 'string', repo: 'string', run_id: 'number (required)' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}/jobs`)
    },
    gh_actions_get_run_logs_url: {
      description: 'Get a temporary download URL for the full log archive (zip) of a run',
      params: { owner: 'string', repo: 'string', run_id: 'number (required)' },
      handler: async (p) => {
        const r = await gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}/logs`, null, true);
        return { download_url: r.url, status: r.status };
      }
    },
    gh_actions_get_job_logs: {
      description: 'Get the raw log text for a specific job - useful for diagnosing a specific failure',
      params: { owner: 'string', repo: 'string', job_id: 'number (required)' },
      handler: async (p) => {
        const token = requireToken();
        let res;
        try {
          res = await fetch(`${API}/repos/${ownerOf(p)}/${repoOf(p)}/actions/jobs/${p.job_id}/logs`, {
            headers: ghHeaders(token), redirect: 'follow'
          });
        } catch (networkErr) {
          return { error: true, message: `Network error fetching job logs: ${networkErr.message}` };
        }
        if (!res.ok) return { error: true, status: res.status };
        const text = await res.text();
        // Trim long logs for context - the last 300 lines are usually what matters for diagnosing a failure
        const lines = text.split('\n');
        const tail = lines.slice(-300).join('\n');
        return { log_tail: tail, total_lines: lines.length };
      }
    },

    gh_actions_list_artifacts: {
      description: 'List artifacts produced by a specific run, or by the whole repo',
      params: { owner: 'string', repo: 'string', run_id: 'number (optional)' },
      handler: async (p) => {
        const path = p.run_id ? `/repos/${ownerOf(p)}/${repoOf(p)}/actions/runs/${p.run_id}/artifacts` : `/repos/${ownerOf(p)}/${repoOf(p)}/actions/artifacts`;
        return gh(requireToken(), 'GET', path);
      }
    },
    gh_actions_get_artifact_download_url: {
      description: 'Get a download URL (zip) for a specific artifact',
      params: { owner: 'string', repo: 'string', artifact_id: 'number (required)' },
      handler: async (p) => {
        const r = await gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/artifacts/${p.artifact_id}/zip`, null, true);
        return { download_url: r.url, status: r.status };
      }
    },

    gh_actions_list_secrets: {
      description: 'List the names of secrets configured in the repo (not the values - GitHub keeps those hidden)',
      params: { owner: 'string', repo: 'string' },
      handler: async (p) => gh(requireToken(), 'GET', `/repos/${ownerOf(p)}/${repoOf(p)}/actions/secrets`)
    }
  };
}

module.exports = { buildGithubActionsTools };
