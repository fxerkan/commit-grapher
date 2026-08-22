# commit-grapher — Connecting your accounts

Per-platform guides for adding a version-control account. commit-grapher reads **metadata only** (commits, branches, PRs) — it never clones your code, and tokens stay in your OS keychain.

| Platform | Status | Guide |
|---|---|---|
| GitHub | ✅ Ready | [github.md](github.md) |
| Azure DevOps | ✅ Ready | [azure-devops.md](azure-devops.md) |
| Jira | ✅ Ready | [jira.md](jira.md) — issues matched to your commits/PRs/branches |
| GitLab | 🔜 Preview | scope `read_api` — settings → Access tokens |
| Bitbucket | 🔜 Preview | App password, *Repositories: Read* |
| Gitea | 🔜 Preview | Settings → Applications → token (`repo`); set full `owner_url` for self-hosted |
| Codeberg | 🔜 Preview | Same as Gitea (`read:repository`) |

## Quick start
1. Open the app (`uvicorn app.main:app --app-dir backend`, then http://localhost:8000).
2. First run shows the **onboarding wizard** — pick a provider, follow its steps, paste the token, **Sync**.
3. You can add **several accounts** (even multiple GitHub users / orgs) via **＋ Add account**.

## The two gotchas most people hit
- **GitHub orgs**: fine-grained tokens can't see an org's repos until the org approves them. Use a **classic** token with `repo` + `read:org`. See [github.md](github.md).
- **Azure Stakeholder license**: cannot read Code — upgrade to **Basic** (free for 5 users). See [azure-devops.md](azure-devops.md).
