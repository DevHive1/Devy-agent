'use strict';

/**
 * Cleans an owner or repo value: strips full GitHub URLs, trailing ".git", stray slashes/whitespace.
 * This guards against common misconfigurations, e.g. GITHUB_DEFAULT_REPO set to a full URL
 * instead of just "repo-name".
 */
function cleanRepoToken(value) {
  if (!value) return value;
  let v = String(value).trim();
  v = v.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  v = v.replace(/\.git$/i, '');
  v = v.replace(/^\/+|\/+$/g, '');
  return v || null;
}

/**
 * Normalizes owner/repo from tool params + config defaults. Also handles common
 * misconfigurations where "owner/repo" ends up combined into a single field (either the
 * per-call "repo" param, or a default env var that was set to a full URL) instead of two
 * separate values.
 */
function normalizeOwnerRepo(p, githubConfig) {
  let owner = cleanRepoToken(p.owner) || cleanRepoToken(githubConfig.defaultOwner);
  let repo = cleanRepoToken(p.repo) || cleanRepoToken(githubConfig.defaultRepo);

  if (repo && repo.includes('/')) {
    const parts = repo.split('/').filter(Boolean);
    if (parts.length >= 2) {
      repo = parts[parts.length - 1];
      owner = owner || parts[parts.length - 2];
    }
  }
  // Safety net if owner itself ended up combined (e.g. a default env var was a full URL)
  if (owner && owner.includes('/')) {
    const parts = owner.split('/').filter(Boolean);
    if (parts.length >= 2) {
      owner = parts[parts.length - 2];
      repo = repo && !repo.includes('/') ? repo : parts[parts.length - 1];
    }
  }

  return { owner, repo };
}

/** Adds a helpful diagnostic hint to common GitHub API errors (404/401/403) instead of a bare message. */
function explainGithubError(status, message) {
  if (status === 404) {
    return `${message} — check: (1) owner/repo are correct and were passed separately, (2) GITHUB_DEFAULT_REPO in .env must be just the repo name, not a full URL, (3) if the repo is private, make sure the token has access to it.`;
  }
  if (status === 401 || status === 403) {
    return `${message} — the token is invalid or missing scopes. Required scopes: repo + workflow (classic token), or Contents/Pull requests/Actions (fine-grained token).`;
  }
  if (status === 422) {
    return `${message} — the request was rejected as invalid, often because a branch/ref/sha is stale or a required field is missing.`;
  }
  return message;
}

const API = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function gh(token, method, path, body, raw = false) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: ghHeaders(token),
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'follow'
    });
  } catch (networkErr) {
    return { error: true, status: 0, message: `Network error reaching GitHub API: ${networkErr.message}. Check your internet connection.` };
  }
  if (raw) {
    return { status: res.status, ok: res.ok, url: res.url };
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text.slice(0, 2000) }; }
  if (!res.ok) {
    const message = explainGithubError(res.status, data.message || res.statusText);
    return { error: true, status: res.status, message };
  }
  return data;
}

module.exports = { cleanRepoToken, normalizeOwnerRepo, explainGithubError, gh, ghHeaders };
