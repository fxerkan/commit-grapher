# AGENTS.md — Working on commit-grapher

This file orients **any** AI coding agent (Claude, Codex, Cursor, etc.). The full project
guide, architecture, and coding standards live in **[CLAUDE.md](CLAUDE.md)** — read it first.

## The product in one line
A local-first tool that aggregates commit/PR/branch **metadata** (never code) from every
version-control account into one interactive network graph, contribution heatmap, and charts.

## Ground rules (non-negotiable)
1. **Metadata only** — never clone repos or read file contents.
2. **Tokens** — only via `keyring`; never print, log, or write them to disk/DB. `.env` is git-ignored.
3. **Adapters are the seam** — provider-specific code lives only in `backend/app/adapter.py`;
   the rest speaks normalized dataclasses.
4. **Lazy first (ponytail)** — simplest working solution; no speculative abstractions or new
   deps for what a few lines do; mark shortcuts with a `ponytail:` comment.
5. **Perf at scale** — hundreds of repos must stay smooth: memoize Sigma settings, never blank
   the graph on filter change, scale layout to node count.

## How to pick up work
- Tasks/milestones are in **Backlog.md** (`backlog/` dir + Backlog MCP). Grab a task, move it to
  In Progress, keep the acceptance criteria in the task.
- Keep changes **grouped by concern** and commit per logical group (backend / frontend / docs),
  not one giant commit and not one-per-file.

## Build & verify
```bash
pip install -e backend && uvicorn app.main:app --app-dir backend   # API + served UI on :8000
cd frontend && npm run build                                        # or npm run dev
python -m app.test_charts                                           # backend self-check
```
Verify UI changes in the browser (the graph/heatmap are visual); don't mark a task done on a
green build alone.

## Where things are
- Graph + filters: `frontend/src/views/GraphView.tsx`, `components/MultiSelect.tsx`
- Heatmap + git-graph: `frontend/src/views/HeatmapView.tsx`, `components/GitGraph.tsx`
- Backend graph/filter logic: `backend/app/graph.py`, `routes.py`
- Sync: `backend/app/crawler.py`, `adapter.py`
- Connection guides: `docs/`
