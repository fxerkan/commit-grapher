# Connecting Codeberg

Codeberg runs **Gitea**, so commit-grapher reads it via the Gitea API v1 (repos, branches,
PRs, commits). Code is never cloned.

## Create a token

1. **Codeberg → Settings → Applications → Generate New Token**
   (`https://codeberg.org/user/settings/applications`).
2. Scopes: **`read:repository`** (+ **`read:organization`** for org repos). Copy it.
3. In commit-grapher → provider **Codeberg**:
   - **username** = your **user or organization** name.
   - **owner_url** defaults to `https://codeberg.org/<username>`.
   - Paste the token.

The token is stored in your OS keychain, never on disk.

## What is synced

Repos, branches, pull requests (all states), commits, and tags for the owner. Public repos
can be read without a token; add one to include private or org repos.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 0 repos | Wrong owner or missing scope | Check the username; add `read:repository` (+ `read:organization`) |
| `401` | Token invalid/expired | Regenerate under Settings → Applications |

For self-hosted Gitea instances, use the **[Gitea guide](gitea.md)** and set `owner_url` to your host.
