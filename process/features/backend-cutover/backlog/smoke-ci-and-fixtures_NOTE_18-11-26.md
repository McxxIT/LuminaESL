---
name: note:smoke-ci-and-fixtures
description: "Backlog: npm run smoke is not in CI and leaves fixture rows in the dev DB"
date: 18-11-26
feature: backend-cutover
---

# Smoke in CI and fixture growth

status: done-with-gap
item: B3-GAP-SMOKE-CI (from b3-domain-smoke_PLAN_18-11-26, user-accepted known gap)
reason: The repo has no CI and no disposable test database; the smoke runs only by hand against local Postgres.

## Gap

- `npm run smoke` (`backend/scripts/smoke.ts`) needs local Postgres + the backend env file and is not run automatically.
- Each run leaves rows behind (archived `smoke-{runId}-*@smoke.lumina.test` users, a course with 12 plans, lessons, ledger rows, activity rows). The script never deletes data by design.

See also `e2e-ci-wiring_NOTE_18-11-26.md`, which describes the same blocker for the Playwright suite (no CI provider, no disposable database). Cross-linked rather than merged because that item is `BLOCKED` and this one is `done-with-gap`.

## Next step

NEW PLAN REQUIRED: a CI job with a throwaway Postgres (migrate, seed, smoke), or a dedicated test database the smoke can truncate safely. Until then, archived smoke users can be filtered out of admin lists by status.
