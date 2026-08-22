# Connecting Bitbucket

commit-grapher reads Bitbucket Cloud Git metadata (repos, branches, PRs, commits) via the
REST v2 API. Code is never cloned.

## Getting a credential (this is the tricky part)

Bitbucket Cloud has several token types and they are **not** interchangeable. Pick by what your
plan allows:

**⚠️ Not this one:** `admin.atlassian.com → API keys` (the *organization* admin keys). Those only
carry `*:admin` org-management scopes (accounts, groups, domains) — **no Bitbucket scopes** — and
return 401 against the Bitbucket API. A plain Jira API token also 401s (no Bitbucket scopes).

**Option A — Personal API token with Bitbucket scopes** (free, workspace-wide):
1. Go to **[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)**
   (your *personal* tokens — **not** the org admin page above).
2. **Create API token with scopes** → choose **Bitbucket** and tick `read:repository:bitbucket`,
   `read:pullrequest:bitbucket`, `read:workspace:bitbucket`.
3. In commit-grapher: **username = your Atlassian email**, **owner_url = `https://bitbucket.org/<workspace>`**.

If the scope picker offers no Bitbucket app for your account, use Option B.

**Option B — Repository access token** (free, but one repo at a time):
Repo → **Repository settings → Access tokens → Create** (scopes: *Repositories: Read*,
*Pull requests: Read*). In commit-grapher: **leave username blank** (the token authenticates as a
Bearer token), **owner_url = the repo's workspace**. Note this only sees that single repo.

**Option C — Workspace access token** (**Premium** only): Workspace settings → Access tokens.
Same as B but covers the whole workspace. Leave username blank.

App passwords have been retired, so they're no longer an option.

Auth: Basic (email + API token) when a username is given, or Bearer (access token) when blank.
The token is stored in your OS keychain, never on disk.

## What is synced

- All repositories in the workspace, their branches, pull requests (all states), and commits
  (default branch in full + other branches shallow, same as the other providers).
- Tags feed the tag filter and word cloud.
- No stars/forks (Bitbucket has none); language is captured when the repo declares one.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Org **admin** API key, a Jira-only token, or app password (retired) | Use a token **with Bitbucket scopes** (Option A) or an access token (Option B/C); not the `admin.atlassian.com` key |
| `403 Forbidden` on some repos | Token lacks access to a private repo | Grant access, or it's simply skipped (crawl is per-repo resilient) |
| Workspace has 0 repos | Wrong workspace in `owner_url` | Use the exact workspace: `https://bitbucket.org/<workspace>` |

## Finding your workspace

It's the segment after `bitbucket.org/` in your repo URLs, or **Workspace settings → Overview**.
