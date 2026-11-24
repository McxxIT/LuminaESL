---
name: note:frontend-library-create-item-unit-test
description: "Backlog: unit test for the frontend createLibraryItem local-branch happy path (FileReader/IndexedDB); guards and permissions are already covered by Phase 05 Vitest"
date: 25-11-26
feature: launch-readiness
---

# Frontend library createLibraryItem unit test

status: open, partially resolved by Phase 05 (commit 5c1b4b9; renamed from frontend-library-service-unit-tests)
reason: Phase 05 added the frontend Vitest runner and covered the `services/library.ts` local-branch guards (archived item cannot attach, no attach on cancelled lessons, creator-or-admin edit) and the library permission actions in `frontend/tests/library.test.ts` and `frontend/tests/permissions.test.ts`. The `createLibraryItem` happy path was not covered because it needs `FileReader` and IndexedDB, which the node test environment lacks.
item: Phase 04 known gap, residual after Phase 05
priority: low

## Item

Cover `createLibraryItem` (local branch) end to end: either add a small browser-API shim (fake `FileReader` plus an in-memory attachment store behind `attachment-download.ts`) to `frontend/tests/helpers/`, or run it under a `jsdom`/`happy-dom` environment for that one file. Do not refactor app code only for testability.
