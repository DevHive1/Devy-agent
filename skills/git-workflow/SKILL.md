---
name: git-workflow
description: Standard git workflow to create a branch, commit changes, push, and open a PR.
allowed-tools: [git_branch, git_checkout, git_status, git_add, git_commit, git_push, gh_create_pull_request]
---
# Git Workflow

This skill guides you through the standard process of working on a feature and creating a pull request.

## Steps

1. **Verify status**: Run `git_status` to see current uncommitted changes.
2. **Create branch**: Create and switch to a descriptive feature branch (e.g. `feature/add-skills-system`) using `git_checkout` with `create: true`.
3. **Stage files**: Stage all relevant modifications using `git_add`.
4. **Commit**: Create a clear commit message conforming to Conventional Commits (e.g. `feat: add skills system`) using `git_commit`.
5. **Push branch**: Push the new branch using `git_push` with `remote: "origin"` and the branch name.
6. **Open PR**: Create a pull request to the base/default branch using `gh_create_pull_request`.
