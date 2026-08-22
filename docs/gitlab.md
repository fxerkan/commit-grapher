# Connecting GitLab

commit-grapher reads GitLab metadata (projects, branches, merge requests, commits) via the
REST v4 API. Code is never cloned. Works with gitlab.com and self-hosted GitLab.

## Create an access token

1. **GitLab → Preferences → Access Tokens** (`/-/user_settings/personal_access_tokens`).
2. Add a token with the **`read_api`** scope; copy it.
3. In commit-grapher → provider **GitLab**:
   - **username** = your **user or group** namespace (e.g. `alice` or `acme-team`).
   - **owner_url** defaults to `https://gitlab.com/<namespace>`; set it to your host for self-hosted
     (e.g. `https://gitlab.acme.com/team`).
   - Paste the token.

The token is sent as the `PRIVATE-TOKEN` header and stored in your OS keychain, never on disk.

## What is synced

- All projects in the namespace (a group also includes its **subgroups**), their branches,
  merge requests (all states), commits, and tags.
- Merge requests map to PRs; `opened`→open, `merged`→merged.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 0 projects | Namespace is neither a matching user nor group, or token can't see them | Check the namespace; `read_api` scope; for private groups the token owner must be a member |
| `401` | Token invalid/expired or wrong host | Recreate with `read_api`; set `owner_url` to the correct self-hosted host |

## Finding your namespace

It's the segment after the host in your project URLs: `gitlab.com/<namespace>/<project>`.
