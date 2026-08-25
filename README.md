# commit-graph`er`

<sub>🌐 **English** · [Türkçe](README.tr.md)</sub>

> **Your git history, deanonymized.** commit-grapher rounds up every commit, branch, and
> pull request from **all** your version-control accounts, drags them into one gloriously
> nerdy dashboard, and gently snitches on your 2 AM coding habits — all **without ever
> reading a single line of your code.**

It talks to GitHub, Azure DevOps, GitLab, Bitbucket, Gitea and Codeberg (and matches your
Jira issues to commits), reads **git metadata only** via the providers' REST APIs, and keeps
your tokens in the OS keychain — never on disk, never in the code, never anywhere it
shouldn't be.

<sub>Local-first · metadata-only · no telemetry · v0.1.0</sub>

---

## What you get

### 🕸️ Network Graph — the flagship
An Obsidian-style, physics-driven WebGL graph (Sigma.js) of **accounts → repos → branches →
PRs → commits**. Zoom, drag, hover to light up a node's neighbourhood, click a repo to focus
and drill in. A rich left filter panel slices by provider, account, organization, workspace,
repo, branch, PR, author, tag — plus a human-vs-AI toggle and "only my activity".

### 🟩 Contribution Heatmap
The familiar GitHub calendar — except combined across **every** provider at once. Click any
day to drill into a real **git-graph** (branch/merge lanes, clickable commit links).

### 📊 Stats dashboard
KPI cards plus genuinely fun deep-dives: **The Essay** (your longest commit message),
**A long time ago, in a repo far, far away** (your oldest commit/PR), **Code Besties**
(who you commit alongside most), **The Graveyard** (repos you've ghosted), your
**Night-Owl hour**, most-starred repos, a tag cloud, and per-repo enrichment (stars, forks,
releases, contributors, Docker pulls, npm downloads). Everything cross-filters and every
section collapses.

### 👥 Contributors
Everyone who's ever touched your repos, ranked — with per-contributor commit counts and a
human-vs-AI breakdown (yes, it knows which commits your robots wrote).

### 🔌 Accounts
Add a provider with a Personal Access Token or GitHub OAuth device flow, rename accounts,
and export/import your whole dataset as JSON.

## Screenshots

**Network Graph** — accounts, repos, branches, PRs and commits as one living map:

![Network Graph (dark)](docs/assets/graph-black.png)

<table>
<tr>
<td width="50%"><b>Contribution Heatmap</b><br><img src="docs/assets/heatmap.png" alt="Contribution heatmap"></td>
<td width="50%"><b>Contributors</b><br><img src="docs/assets/contributers.png" alt="Contributors"></td>
</tr>
<tr>
<td><b>Stats dashboard</b><br><img src="docs/assets/stats-1.png" alt="Stats dashboard"></td>
<td><b>Stats — repository stats &amp; charts</b><br><img src="docs/assets/stats-2.png" alt="Stats charts"></td>
</tr>
<tr>
<td><b>Accounts &amp; integrations</b><br><img src="docs/assets/integrations.png" alt="Accounts"></td>
<td><b>Light theme</b><br><img src="docs/assets/graph-white.png" alt="Network graph light theme"></td>
</tr>
</table>

> 📖 A full walkthrough with an animated live graph lives on the **[project site](https://fxerkan.github.io/commit-grapher/)**.

## Privacy, plainly

- **Metadata only.** Commits, branches, PRs, tags, repo stats. The app *never* clones a repo
  or reads file contents. It only judges your commit messages.
- **Tokens live in your OS keychain** (via `keyring`) — never written to disk in plaintext,
  never logged, never committed.
- **Local-first.** It runs on your machine and talks straight to the providers. No middleman.

## Run it

One command — creates the venv, installs everything, builds the frontend, and serves it all on `:8000`:

```bash
./start.sh                # → http://localhost:8000
```

Prefer hot reload while hacking? Runs the backend and the Vite dev server together:

```bash
./start.sh dev            # backend :8000 · frontend :5173
```

<details>
<summary>…or the manual steps</summary>

```bash
# backend (Python ≥ 3.13)
python -m venv .venv && source .venv/bin/activate
pip install -e backend
uvicorn app.main:app --app-dir backend --reload    # http://localhost:8000

# frontend — dev (hot reload, proxies /api to :8000)
cd frontend && npm install && npm run dev           # http://localhost:5173
# ...or build once and let the backend serve it on :8000
cd frontend && npm run build
```
</details>

## Connect an account

Open the app → **Accounts** → add a provider + Personal Access Token → **Sync** → explore.
Per-provider, step-by-step guides (token scopes, gotchas) live in [`docs/`](docs/):

| Provider | Guide |
|---|---|
| GitHub | [docs/github.md](docs/github.md) |
| Azure DevOps | [docs/azure-devops.md](docs/azure-devops.md) |
| GitLab | [docs/gitlab.md](docs/gitlab.md) |
| Bitbucket | [docs/bitbucket.md](docs/bitbucket.md) |
| Gitea | [docs/gitea.md](docs/gitea.md) |
| Codeberg | [docs/codeberg.md](docs/codeberg.md) |
| Jira (issue matching) | [docs/jira.md](docs/jira.md) |

> **Tip:** for full GitHub org coverage, use a **classic** token (`repo` + `read:org`).
> Fine-grained tokens can't see an org's repos until the org approves them.

## Test

```bash
python -m app.test_charts     # from backend/, with the venv active
```

## Versioning

Semantic Versioning, tracked in [CHANGELOG.md](CHANGELOG.md). The version is defined once in
`frontend/package.json` and injected at build time (shown in the filter-panel footer on every
page). Pre-1.0: patch = fixes, minor = features, major = the first stable release.

## Roadmap

Tracked with [Backlog.md](https://backlog.md) under `backlog/` — network-graph polish,
more providers, richer stats, and a public GitHub Pages site with a live animated graph.

---

Built by [FXerkan](https://github.com/FXerkan) · [github.com/fxerkan/commit-grapher](https://github.com/fxerkan/commit-grapher)
