---
name: note:frontend-library-service-unit-tests
description: "Backlog: Vitest unit tests for the frontend library service local-branch guards and library permissions (Phase 05 owns the runner)"
date: 24-11-26
feature: launch-readiness
---

# Frontend library service unit tests

status: carry-in to Phase 05 (no frontend unit runner exists until then)
reason: The guards are covered at the UI level by the demo e2e only, not in isolation.
item: Phase 04 known gap
priority: medium

## Item

When Phase 05 adds the frontend Vitest runner, cover `frontend/app/lib/school/services/library.ts` local-branch guards (archived item cannot attach, no attach on cancelled lessons, creator-or-admin edit) and the `library.manage`, `library.edit`, `lesson.attachLibraryItem` actions in `frontend/app/lib/school/permissions.ts`.
