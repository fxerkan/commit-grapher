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

[Unreleased]: https://github.com/fxerkan/commit-grapher/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/fxerkan/commit-grapher/releases/tag/v0.1.0
