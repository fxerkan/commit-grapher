---
id: TASK-29
title: 'Versioning + CHANGELOG (SemVer, dynamic version)'
status: Done
assignee: []
created_date: '2026-08-22 21:09'
labels: []
milestone: m-5
dependencies: []
type: chore
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce SemVer versioning starting at v0.1.0 and a CHANGELOG.md (Keep a Changelog format). Version must be dynamic (single source of truth), not hardcoded per page/script.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CHANGELOG.md exists with a v0.1.0 entry and a documented bump strategy (patch/minor/major, pre-1.0)
- [ ] #2 Version comes from one source (frontend/package.json), injected at build time (Vite define -> __APP_VERSION__) and consumed via src/version.ts
- [ ] #3 No hardcoded version literals in app pages/components
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added CHANGELOG.md (Keep a Changelog + SemVer, v0.1.0 first release with bump strategy). Version is now injected from frontend/package.json at build time via vite `define: __APP_VERSION__` and read through src/version.ts (APP_NAME/APP_VERSION/REPO_URL/AUTHOR_URL). package.json version set to 0.1.0.
<!-- SECTION:FINAL_SUMMARY:END -->
