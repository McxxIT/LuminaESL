---
name: note:frontend-test-runner
description: "Backlog: demo/local service rules still lack a unit runner; D1 closed the browser half only"
date: 18-11-26
feature: backend-cutover
---

# Frontend test runner (residual R1)

status: done (25-11-26, commit 5c1b4b9, Phase 05)
item: B3-R1 (validate-contract residual R1, user-accepted)
reason: The frontend has a browser parity suite but no unit/component runner, so demo/local-branch service rules can still only be checked by agent probes or through the UI.

## Gap

Local-branch behavior changed in B3 (1 credit per lesson, approve-cancel refuses completed lessons, homework re-review refused, API rating and attachment upload paths) had no repeatable automated gate. B3 used a one-off Node probe that drives the real local services on a memory store (`createMemoryAdapter`) plus Chromium checks.

D1 (18-11-26) closed the **browser** half: `frontend/e2e` runs 9 API-mode specs plus 1 demo regression through `npm run e2e`. The demo spec proves login, IndexedDB upload/download, bell read/mute, and zero API calls, but it exercises services through the rendered UI only.

Still uncovered: service-level assertions on the local branch (exact credit/refund deltas, permission matrix, refusal codes) and the B3 memory-adapter probe, which is not committed anywhere.

## Next step

NEW PLAN REQUIRED: add vitest to `@lumina/frontend` and turn the B3 probe (memory-adapter store + services) into committed tests for bookings, approvals, credits, homework, and quality. Do not duplicate what `frontend/e2e` already proves; target the service boundary.

## Resolution

Resolved 25-11-26 (launch-readiness Phase 05, commit `5c1b4b9`). The frontend has a Vitest runner: `npm run test --workspace @lumina/frontend`, node environment, 10 files / 54 tests under `frontend/tests/` driving the real local services on a memory store (`frontend/tests/helpers/`). Covers credits, bookings and rebook, approvals, homework, quality, notifications, permissions, library guards, upload validation, and the credit-copy guard. Still open: the `createLibraryItem` happy path (see `launch-readiness/backlog/frontend-library-create-item-unit-test_NOTE_25-11-26.md`).
