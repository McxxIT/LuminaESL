---
name: note:phase-05-review-residuals
description: "Backlog: Phase 05 code-review residuals (rebook TOCTOU, scheduled-original rebook via API, smoke room-code flake, test hygiene, vitest specifier, copy-guard file list, missing smoke 409/403 cases)"
date: 25-11-26
feature: launch-readiness
---

# Phase 05 review residuals

status: open, low priority (Phase 05 closed; review decision approved by the user 25-11-26, 0 Critical/High/Medium)
reason: Low and nit findings from the independent vc-code-reviewer pass; none block anything.
item: Phase 05 review (rebook enrichment, credits copy, frontend Vitest)
priority: low

## Items

1. **TOCTOU on live status (accepted, benign):** `POST /lessons/:id/rebook` reads the original's status and a lesson can go live before the insert commits. The only effect is a rebook of a lesson that just went live; the debit and slot claim stay atomic. Accepted.
2. **API accepts rebook of a `scheduled` original by direct call:** matches the user decision (any non-live original); the UI never offers it. Revisit only if product wants it refused.
3. **Singular wording only in the billing transactions table:** "1 credit" is singular there; other quantities read plural. Fine unless more screens show quantities.
4. **Smoke room-code inequality flake:** the `rebook` check that the fresh `ESL-####` code differs from the original's collides about 1 in 9000 runs. Rerun once before treating it as a defect, or assert uniqueness among active lessons instead.
5. **Test hygiene:** `vi.unstubAllEnvs()` runs in a test body, not an `afterEach`; move it.
6. **Vitest specifier:** frontend pins `3.2.7` exactly while backend uses `^3.0.5`; align the specifiers (both resolve to one hoisted copy today). Do it with the Phase 06 lockfile and `npm ci` work.
7. **Copy guard file list is fixed:** `frontend/tests/credit-copy.test.ts` guards a fixed file set; extend it whenever a new screen shows credits.
8. **Missing smoke cases (candidates):** rebook of a slot that is no longer open returns 409, and rebooking another student's lesson returns 403.
