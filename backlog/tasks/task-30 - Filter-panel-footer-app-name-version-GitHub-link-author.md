---
id: TASK-30
title: 'Filter panel footer: app name + version + GitHub link + author'
status: Done
assignee: []
created_date: '2026-08-22 21:09'
labels: []
milestone: m-5
dependencies: []
type: feature
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show "<app_name> <version> · GitHub icon (repo hyperlink) · by FXerkan" pinned to the bottom of the shared Filter Panel on every page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Credit line pinned to the bottom of the FilterPanel (Graph, Heatmap, Stats)
- [ ] #2 Shows app name + dynamic version, a GitHub mark linking to the repo, and 'by FXerkan' linking to the author
- [ ] #3 Theme-aware styling, does not overlap dropdowns/scroll
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
FilterPanel now renders a bottom credit row (margin-top:auto in the flex-column panel): "commit-grapher v{APP_VERSION} · [GitHub mark → repo] · by FXerkan → author". Uses inline SVG GitHub mark and values from src/version.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
