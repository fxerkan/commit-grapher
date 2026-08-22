# Connecting Azure DevOps

commit-grapher reads Azure DevOps Git metadata (commits, branches, PRs) via the REST API. Code is never cloned.

## Create a Personal Access Token

1. Sign in to your org: `https://dev.azure.com/{org}` (or the older `https://{org}.visualstudio.com`).
2. **User settings** (top-right) → **Personal access tokens** → **New Token**.
3. **Organization**: pick the org you want (a PAT is scoped to one org).
4. **Scopes**: **Code → Read**.
5. Create, copy the token.
6. In commit-grapher → provider **Azure DevOps** → **username = the organization name** → paste the token.
   - New URL style: leave `owner_url` blank (defaults to `https://dev.azure.com/{org}`).
   - Old VSTS style: set `owner_url` to `https://{org}.visualstudio.com`.

## ⚠️ Licensing — the #1 gotcha

Reading repos requires a **Basic** (or higher) access level. A **Stakeholder** license **cannot read Code**, so the API redirects to sign-in / returns 401 even if you are the **organization owner**.

Fix (org owner): **Organization Settings → Users** → set your access level to **Basic** (Basic is free for the first 5 users).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `302 → _signin` / redirect to Entra | PAT rejected — empty/invalid, or Stakeholder license, or org blocks PAT/basic auth | Use a valid **Code: Read** PAT; upgrade to **Basic**; check org PAT policy |
| `401 Unauthorized` | PAT is for a different org, or wrong org name | The username must be the org that owns the PAT |
| Org has 0 Git repos | Projects use Boards/TFVC, not Git | Only Git repos are synced (Boards **work items** are also pulled, for projects that have repos) |

## Finding your org name

**Organization Settings → Overview → Name**, or the first path segment of `dev.azure.com/{org}`.
