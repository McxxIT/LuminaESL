---
name: report:account-invites-evl-iteration-001
description: "EVL cycle 1 for account-invites: gates green; review-driven supplement for 2 Medium findings (lock-order deadlock, stale create-form copy)"
date: 25-11-26
feature: launch-readiness
domain: tests
iteration: 1
---

# EVL iteration 001 — account-invites

- Independent vc-tester: all 14 contract gates green (backend vitest 12/98, frontend 11/62, smoke 17 domains/817, e2e 30 API + 5 demo, npm ci ok); only expected failure = review-decision.json missing.
- vc-code-reviewer: approved-with-concerns, 0 Critical/High. User chose to fix 2 Medium items before commit:
  1. Lock-order inversion: POST /auth/set-password locks token then user; resend/PATCH/DELETE lock user then token -> possible deadlock (500, no corruption). Fix: lock user first in set-password; add smoke race test accept vs resend and accept vs archive (no 500).
  2. Stale copy "can sign in right away" on 3 create forms (PeopleForms.tsx ~57, 77, 124) -> mode-aware text in API mode.
- Routed to vc-execute-agent supplement (scoped), then vc-tester re-run.
