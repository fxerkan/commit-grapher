# commit-graph`er`

Aggregates your commit/contribution history across git hosts (GitHub, Azure DevOps, GitLab,
Bitbucket, Gitea, Codeberg) into one local web app. Reads **git metadata only** via provider
REST APIs — never clones or touches your code.

- **Network graph** (Sigma.js/WebGL) — repos, branches, PRs as nodes/edges, Obsidian-style.
- **Contribution heatmap** (ECharts) — GitHub-style calendar, combined across providers.

Tokens are stored in your OS keychain (via `keyring`), never on disk in plaintext.

## Run

Backend (Python ≥3.13):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e backend
uvicorn app.main:app --app-dir backend --reload   # http://localhost:8000
```

Frontend — dev (hot reload, proxies /api to :8000):

```bash
cd frontend && npm install && npm run dev          # http://localhost:5173
```

…or build once and let the backend serve everything on :8000:

```bash
cd frontend && npm run build                       # then just run uvicorn
```

Then open the app → **Accounts** tab → add a provider + Personal Access Token → **Sync** →
view the **Network Graph** and **Contribution Heatmap**.

## Test

```bash
python -m app.test_charts     # from backend/, with the venv active
```

## Status

MVP: GitHub + Azure DevOps. Adding the other providers is just new entries behind the same
`GitHarborAdapter` (`backend/app/adapter.py`). See the plan for the roadmap (extra chart
views, public-web mode).
