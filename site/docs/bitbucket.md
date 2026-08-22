# Connecting Bitbucket

commit-grapher reads Bitbucket Cloud Git metadata (repos, branches, PRs, commits) via the
REST v2 API. Code is never cloned.

## Create an API token

Atlassian **deprecated app passwords** — use an API token.

1. Go to **[id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)**.
2. **Create API token**, label it, copy the value.
3. In commit-grapher → provider **Bitbucket**:
   - **username** = your **workspace id** (e.g. `acme`) for a personal workspace, or your **login**
     for an org workspace where the two differ.
   - **owner_url** defaults to `https://bitbucket.org/<workspace>` — set it explicitly if your login
     differs from the workspace you want to read.
   - Paste the API token.

Auth is HTTP Basic (login + token); the token is stored in your OS keychain, never on disk.

## What is synced

- All repositories in the workspace, their branches, pull requests (all states), and commits
  (default branch in full + other branches shallow, same as the other providers).
- Tags feed the tag filter and word cloud.
- No stars/forks (Bitbucket has none); language is captured when the repo declares one.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | App password (retired) or wrong login | Create an **API token** at id.atlassian.com; username must be the workspace/login that can read it |
| `403 Forbidden` on some repos | Token/user lacks access to a private repo | Grant the account access, or it's simply skipped (crawl is per-repo resilient) |
| Workspace has 0 repos | Wrong workspace in `owner_url` | Use the exact workspace: `https://bitbucket.org/<workspace>` |

## Finding your workspace

It's the segment after `bitbucket.org/` in your repo URLs, or **Workspace settings → Overview**.
