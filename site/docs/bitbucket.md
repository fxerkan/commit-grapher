# Connecting Bitbucket

commit-grapher reads Bitbucket Cloud Git metadata (repos, branches, PRs, commits) via the
REST v2 API. Code is never cloned.

## Create an API token (with Bitbucket scopes)

Atlassian **retired app passwords**, and **workspace access tokens need Premium** — so use an
**API token with Bitbucket scopes**. A plain Jira API token will **not** work (401): the token
must explicitly carry Bitbucket scopes.

1. Go to **[id.atlassian.com → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)**.
2. **Create API token with scopes** → tick the **Bitbucket** scopes: `read:repository:bitbucket`,
   `read:pullrequest:bitbucket` (and `read:workspace:bitbucket`). Copy the value.
3. In commit-grapher → provider **Bitbucket**:
   - **username** = your **Atlassian account email** (e.g. `you@company.com`).
   - **owner_url** = your workspace, e.g. `https://bitbucket.org/acme` (**required**).
   - Paste the API token.

Auth is HTTP Basic (email + token); the token is stored in your OS keychain, never on disk.

> **Note on token types.** *Workspace / project access tokens* (Workspace settings → Access tokens)
> are a **Premium** feature. *App passwords* have been removed. The free path is a scoped **API
> token** as above, or a per-repository **Repository access token**.

## What is synced

- All repositories in the workspace, their branches, pull requests (all states), and commits
  (default branch in full + other branches shallow, same as the other providers).
- Tags feed the tag filter and word cloud.
- No stars/forks (Bitbucket has none); language is captured when the repo declares one.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | App password (retired), a Jira-only token, or username isn't the email | Create an API token **with Bitbucket scopes**; username = your Atlassian **email** |
| `403 Forbidden` on some repos | Token lacks access to a private repo | Grant access, or it's simply skipped (crawl is per-repo resilient) |
| Workspace has 0 repos | Wrong workspace in `owner_url` | Use the exact workspace: `https://bitbucket.org/<workspace>` |

## Finding your workspace

It's the segment after `bitbucket.org/` in your repo URLs, or **Workspace settings → Overview**.
