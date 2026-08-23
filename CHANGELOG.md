# Changelog

All notable changes to **commit-grapher** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning strategy

Pre-1.0, the app is under active development and the public surface can still shift:

- **PATCH** (`0.1.0 → 0.1.1`) — bug fixes and small, backward-compatible tweaks.
- **MINOR** (`0.1.x → 0.2.0`) — new features / pages / providers; may include additive,
  non-breaking schema migrations.
- **MAJOR** (`0.x → 1.0.0`) — the first stable release once the data model and provider
  set are locked; after that, MAJOR is reserved for breaking changes.

Bump `APP_VERSION` in `frontend/src/version.ts` and `version` in `frontend/package.json`
together with the entry added here.

## [Unreleased]

## [0.2.0] — 2026-08-23

### Added

- **Hover tooltips on graph nodes** — a floating card showing the node's label, type and
  aggregate stats (commits / branches / PRs for a repo; repos + totals for an account),
  attached server-side to each node.
- **Date-range quick presets on the Network Graph** — the `1h/1d/1w/30d/90d/1y/All` presets
  and date pickers now filter the graph too (repos with commits in-window, in-window counts).
- **Intro animation** — on first graph load, nodes reveal step by step (repo → branches →
  PRs → work items), several account subtrees growing in parallel like the landing page.
  Toggle + duration live in Settings; auto-skips on very large (>4000-node) graphs.
- **Export graph as PNG** — download a headlessly-rendered image of the current network
  (same layout, filters and theme as the live view).

### Changed

- **AI-authored commits are now queryable in GraphQL without focusing a repo** — commit
  nodes are read live from the DB; added an `aiOnly` argument to `nodes`/`count`.
- **Drill-down zoom** — clicking a repo now zooms in to fill the canvas instead of resetting
  to fit the whole (tiny) subgraph.
- **Full Turkish coverage** — the Stats dashboard (KPIs, charts, hints, AI roles, pulse, fun
  facts) and the GraphQL panel are now fully translated.
- **Settings nav** — dropped the gear icon so the tab matches the others.

### Fixed

- MultiSelect now shows "no data yet" (instead of "no matches") when a facet has no options
  at all — e.g. the Library/Framework filter when no repo has topics.

## [0.1.0] — 2026-08-23

First public version. A local-first app that aggregates your commit history from every
version-control account you own and turns it into an interactive dashboard — reading
**git metadata only**, never cloning or touching your code.

### Added

- **Multi-provider sync** — GitHub, Azure DevOps, GitLab, Bitbucket, Gitea, and Codeberg
  via provider REST APIs. Tokens are stored in the OS keychain (`keyring`), never on disk.
- **Network Graph** (Sigma.js/WebGL) — accounts → repos → branches → PRs → commits as an
  Obsidian-style force graph with physics, zoom, drag, hover-to-highlight neighbours,
  click-to-focus/drill-down, node-type toggles, search, and a resizable filter panel.
- **Contribution Heatmap** (ECharts) — a GitHub-style calendar combined across all
  providers; click any day to drill into a git-graph (branch/merge lanes, clickable commits).
- **Stats dashboard** — KPI cards, fun deep-dive facts (longest commit, oldest commit/PR,
  co-author "code besties", dormant-repo graveyard, night-owl hour), commits-over-time,
  top repos, author cloud, PR states, by-hour/by-weekday, most-starred repos, and a tag
  cloud — with click-to-drill cross-filtering and collapsible sections.
- **Repository stats enrichment** — stars, forks, watchers, releases, release downloads,
  contributors, build counts, and tags per repo; plus verified npm downloads and
  topic-gated Docker Hub pull counts.
- **Work Items / Issues** — Azure Boards and Jira issues, fuzzy + exact-key matched to
  commits/PRs/branches and bridged into the graph.
- **Shared FilterPanel** — one collapsible left panel across every page: Provider ›
  Account › Organization › Workspace › Repo › Branch › PR › Author › Tag › Date range
  (with `1h/1d/1w/30d/90d/1y/All` quick presets). Dimensions cascade — the Author/Tag/Repo
  lists narrow to the current selection.
- **Accounts** — add via PAT or GitHub OAuth device flow; rename accounts; JSON export/import.
- **Theming** — dark/light themes via CSS variables.

[Unreleased]: https://github.com/fxerkan/commit-grapher/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fxerkan/commit-grapher/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fxerkan/commit-grapher/releases/tag/v0.1.0
