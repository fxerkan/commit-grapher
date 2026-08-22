# Connecting Gitea

commit-grapher reads Gitea metadata (repos, branches, PRs, commits) via the Gitea API v1.
Code is never cloned. Works with any self-hosted Gitea instance (and Codeberg — see its guide).

## Create a token

1. **Gitea → Settings → Applications → Generate New Token**.
2. Scopes: **`read:repository`** (add **`read:organization`** to include org repos). Copy it.
3. In commit-grapher → provider **Gitea**:
   - **username** = your **user or organization** name.
   - **owner_url** = your instance + owner (**required** for self-hosted), e.g.
     `https://git.acme.com/team`.
   - Paste the token.

The token is sent as an `Authorization: token …` header and stored in your OS keychain.

## What is synced

- Repos owned by the user/org, their branches, pull requests (all states), commits, and tags.
- Stars and language are captured when the instance exposes them.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 0 repos | Wrong owner, or token lacks scope | Check `owner_url`; add `read:repository` (+ `read:organization` for orgs) |
| `401` | Token invalid/expired | Regenerate in Settings → Applications |

## Note

Codeberg is a hosted Gitea — it uses this same adapter. See **[codeberg.md](codeberg.md)**.
