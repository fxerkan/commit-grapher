# Connecting GitHub

commit-grapher reads only metadata (commits, branches, PRs) via the GitHub REST API. Your code is never cloned.

## Option A — Classic Personal Access Token (recommended for orgs)

A **classic** token is the most reliable way to include **organization** and **private** repos.

1. Go to **https://github.com/settings/tokens** → *Generate new token (classic)*.
2. Scopes: check **`repo`** and **`read:org`** (or `user`).
3. Generate, copy the token (starts with `ghp_`).
4. In commit-grapher → **Accounts** (or the onboarding wizard) → provider **GitHub** → your username → paste the token → **Add** → **Sync**.

This pulls your personal repos **and** every org you belong to (the app enumerates `/user/orgs` and each org's repos).

## Option B — Fine-grained token

Fine-grained tokens (`github_pat_…`) work for personal repos, but **do not see an organization's repos until that org approves the token**:

- Org owner must enable *Settings → Third-party Access → Personal access tokens*, and you must request access to the org when creating the token.
- Without approval, only your personal repos appear (this is a GitHub restriction, not a bug).

Required fine-grained permissions: **Contents: Read**, **Metadata: Read**, **Pull requests: Read**.

## Option C — OAuth device flow (no token)

In the **Accounts** tab, use **Login with GitHub**. Register a GitHub OAuth App (with *Enable Device Flow* checked) once, paste its Client ID, and authorize with the code. Grants the `repo` scope, so private repos are included.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Only public repos synced | Fine-grained token without org approval | Use a classic token with `repo` + `read:org`, or get org approval |
| `Bad credentials (401)` | Token invalid/expired, or not a GitHub token | Regenerate; classic tokens start `ghp_`, fine-grained `github_pat_` |
| A repo is skipped | Empty repo (GitHub returns 409 on commits) | Expected — empty repos have no commits |
| Missing an org | Not a member, or token lacks `read:org` | Join the org / add `read:org` scope |
