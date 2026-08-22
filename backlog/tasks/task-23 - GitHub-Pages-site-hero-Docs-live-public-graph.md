---
id: TASK-23
title: 'GitHub Pages site: hero + Docs + live public graph'
status: To Do
assignee: []
created_date: '2026-08-22 15:48'
updated_date: '2026-08-22 21:09'
labels: []
milestone: m-5
dependencies: []
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a GitHub Pages site under docs/: a welcome hero + a detailed user guide.

- Hero with an animation showing a HUGE animated network graph of a public GitHub repo's activity ("mint" public repo / fxerkan public repos — confirm target). Prefer a self-contained live animated force-graph (Sigma/canvas) so it needs no paid tooling; use the impeccable skill if available.
- Per-page feature docs (Network Graph, Contribution Heatmap, Stats, Accounts) with screenshots and what each control does.
- Step-by-step "connect an account" guides per provider (reuse docs/*.md: github, azure-devops, gitlab, bitbucket, gitea, codeberg, jira), incl. token scopes and gotchas.
- Consistent branding (logo/favicon/og — see task-24).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hero page with an animated large network-graph (public repo activity) and a clear value prop + CTA
- [ ] #2 Per-page user guide with screenshots (Graph, Heatmap, Stats, Accounts)
- [ ] #3 Step-by-step connect-account guides for every supported provider
- [ ] #4 Served via GitHub Pages from docs/ (or gh-pages); links from README
- [ ] #5 Branding: logo, favicon, og image
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-22 21:09
---
Reopened: expanding scope to include the hero animation of a huge public-repo graph, per-page user-guide docs with screenshots, and connect-account step-by-steps. Note: an 'impeccable' skill is not available in this session; the fallback plan is a self-contained live animated force-graph for the hero (no paid tooling). Confirm the 'mint' hero target repo.
---
<!-- COMMENTS:END -->
