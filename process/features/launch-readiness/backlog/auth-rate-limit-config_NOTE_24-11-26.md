---
name: note:auth-rate-limit-config
description: "Backlog: auth rate-limit env has no production cap, production-only guards depend on NODE_ENV, cookieless refresh shares one per-IP bucket, 429 lacks Retry-After"
date: 24-11-26
feature: launch-readiness
---

# Auth rate-limit and production config follow-ups

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Review findings and Phase 06 deploy decisions; absorbed there rather than patched now.
item: Phase 03 reviewer findings L5 and L6, plus Phase 06 carry-ins
priority: low-medium (Phase 06 should absorb most of this)

## Gaps

- **No production cap:** `AUTH_RATE_LIMIT_MAX` and `RATE_LIMIT_MAX` (`backend/src/config/env.ts`)
  accept any value, so a production deploy can accidentally inherit the test overrides (100000).
  Fix: reject or cap them when `NODE_ENV=production`.
- **NODE_ENV dependence:** the production CORS guard and the `Secure` refresh cookie both depend on
  `NODE_ENV=production`. If a deploy forgets it, both silently relax. Phase 06 should assert it in
  the compose file and CI.
- **Cookieless refresh bucket:** `/auth/refresh` without a cookie shares one per-IP bucket
  (`auth.ts` lines about 104-112). Check that the client treats a 429 on refresh as anonymous and
  does not loop or show an error on the login screen.
- **Retry-After:** the per-IP ceiling 429 (thrown as an `AppError`) lacks a `Retry-After` header.
- **sameSite lax:** the refresh cookie is `sameSite: lax`, which breaks split-origin deploys
  (web and API on different sites). Fine for same-site or reverse-proxied topologies; Phase 06 must
  pick one.

## Next step

Carry into Phase 06 (see "Carried in from Phase 03" in the Phase 06 plan); the env cap and
Retry-After can be a small code change in the same phase.
