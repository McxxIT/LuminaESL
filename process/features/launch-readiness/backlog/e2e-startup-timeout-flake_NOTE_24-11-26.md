---
name: note:e2e-startup-timeout-flake
description: "Backlog: one Playwright webServer 240s startup timeout seen once during Phase 04 execute (rerun and both EVL runs green)"
date: 24-11-26
feature: launch-readiness
---

# e2e webServer startup timeout flake

status: observation (single occurrence, not reproduced; Phase 05 EVL ran e2e twice with no startup timeout; deferred to Phase 06 CI work)
reason: Record in case it recurs, especially before Phase 06 CI.
item: Phase 04 EVL observation
priority: low

## Observation

During Phase 04 execute one `npm run e2e` run failed because a webServer (Next dev or backend) did not become ready within the 240 s limit; the rerun passed and EVL #1 and #2 were first-try green. Candidates: cold Next compile on Windows, port reuse, or a leftover process. If it recurs, raise the timeout in `frontend/playwright.config.ts` or pre-build in CI (Phase 06).
