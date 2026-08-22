# commit-grapher — Project guide for Claude / AI agents

## What this is

A **local-first** app that aggregates your commit/contribution history from **all** your
version-control accounts (GitHub, Azure DevOps, and — in progress — GitLab, Bitbucket,
Gitea, Codeberg) into one place, and visualizes it as:

1. **A large interactive network graph** (the flagship) — accounts → repos → branches →
   PRs → commits as nodes/edges, Obsidian-style: physics, zoom, drag, hover-to-highlight,
   focus/drill-down, and a rich filter panel.
2. **A GitHub-style contribution heatmap** — click any day to drill into a **git-graph**
   (branch/merge lanes, avatars, clickable commit links).
3. **A charts gallery** — commits-over-time, top repos, PR states, author wordcloud, with
   cross-filtering.

**Hard rule:** the app reads **git metadata only** (commits, branches, PRs) via provider
REST APIs. It **never clones or reads code**. Tokens live in the OS keychain, never on disk.

## Architecture

```
backend/  Python 3.13 · FastAPI · stdlib sqlite3 cache · keyring for tokens
  app/adapter.py   per-provider adapters (GitHubAdapter, AzureDevOpsAdapter) — the ONLY
                   code that talks to a provider. Normalized dataclasses out.
  app/crawler.py   account → repos → branches/PRs/commits into SQLite (resilient per-repo)
  app/graph.py     build the network graph (nodes/edges) with server-side filtering
  app/charts.py    heatmap buckets, chart aggregations, git-graph, export/import
  app/routes.py    /api/* endpoints          app/db.py  schema + migrations
frontend/ Vite · React · TypeScript
  src/views/       GraphView (Sigma.js/WebGL), HeatmapView (ECharts + GitGraph),
                   ChartsView (ECharts), Accounts, Onboarding
  src/components/   MultiSelect (custom dropdown), GitGraph (SVG DAG)
docs/     per-platform connection guides (github.md, azure-devops.md, index.md)
```

**Stack rationale:** Sigma.js+graphology for the WebGL graph (scales to 10k+ nodes);
Apache ECharts (Apache-2.0) for every other chart; theming via CSS variables + `data-theme`.

## Coding standards

- **Lazy senior dev (ponytail).** Stop at the first solution that works: stdlib → native
  platform feature → already-installed dep → one line → minimal new code. No speculative
  abstractions, no new dependency for what a few lines do. Mark deliberate shortcuts with a
  `# ponytail:` / `// ponytail:` comment naming the ceiling and upgrade path.
- **Metadata only.** Never add code that clones repos or reads file contents.
- **Adapters are the seam.** All provider-specific logic lives in `adapter.py`. Everything
  else speaks the normalized `NormRepo/NormBranch/NormPR/NormCommit` dataclasses.
- **Perf matters at scale.** Users may have hundreds of repos. Keep Sigma settings
  **memoized** (a new settings object rebuilds the whole WebGL instance). Never blank the
  graph on a filter change; refetch in the background. Scale layout iterations to node count.
- **Theme-aware.** Use CSS variables (`var(--bg/--fg/--border/--accent)`); Sigma/ECharts
  need concrete colors derived from `document.documentElement.dataset.theme`.
- **Tokens.** Only via `keyring`. Never log, echo, print, or write a token to disk/DB.
- **Tests.** Non-trivial logic leaves one runnable check: `python -m app.test_charts`.

## Run & test

```bash
python -m venv .venv && . .venv/bin/activate && pip install -e backend
uvicorn app.main:app --app-dir backend            # http://localhost:8000
cd frontend && npm install && npm run build        # backend serves dist/ ; or `npm run dev`
python -m app.test_charts                          # from backend/, with venv
```

## Roadmap / backlog

Tracked in Backlog.md (see `backlog/` and the Backlog MCP). Milestones:
- **M1 Core** ✅ multi-provider sync, network graph, heatmap, charts (done)
- **M2 Graph UX** ✅ filters, drag, focus, halo labels, perf (done)
- **M3 Heatmap/git-graph** ✅ day drill-down git-graph, avatars, links (done)
- **M4 Filters++** 🔜 Organization dimension, cascaded Branch/PR/Account dropdowns, rename accounts
- **M5 Data depth** 🔜 crawl all branches (full branch/merge lanes), Work Items/Issues (Azure Boards, Jira)
- **M6 Distribution** 🔜 GitHub Pages site (hero + docs + live public graph), social login, logo/favicon/og
- **M7 Charts++** 🔜 more breakdowns/dimensions, author avatars everywhere

## Gotchas learned the hard way
- GitHub **fine-grained** tokens can't see an org's repos until the org approves them; use a
  **classic** token (`repo`+`read:org`) for full org coverage.
- Azure **Stakeholder** license cannot read Code (401/302 redirect); needs **Basic**.
- Re-syncing must **upsert** commits (INSERT OR IGNORE skips existing rows → new columns
  like `url`/`parents` won't backfill).
