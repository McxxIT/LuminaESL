# launch-readiness

<!-- Part of Lumina ESL -->

## Scope

Cross-cutting 6-phase program taking Lumina ESL from its completed local-MVP cutover state to a launch-ready v1:
1. Dev DB `lumina` duplicate-cleanup alignment and migration `0004`
2. Attachment download access scoping and staff-managed credits policy (API mode)
3. Auth & account lifecycle hardening (password change/reset, rate limits, refresh-token cleanup, cookie/CORS)
4. Planned Curriculum Library (reusable shared materials attached to lessons/bookings)
5. Parity polish (rebook enrichment, "credits" copy, 390px mobile tabs) and frontend Vitest runner
6. GitHub Actions CI and Docker Compose packaging (Postgres + API + Web)

## Related Context

- `process/context/all-context.md` -- root architecture & stack router
- `process/context/database/all-database.md` -- schema, migrations, booking & credit integrity
- `process/context/auth/all-auth.md` -- JWT/cookie auth, role scoping, demo vs API mode
- `process/context/uxui/all-uxui.md` -- app shell, role screens, dual-branch school data layer
- `process/context/tests/all-tests.md` -- verification gates (Vitest, smoke, Playwright)

## Current Status

Status: active (Phase 0 scaffold complete; Phase 01 next)

## Folder Contents

```
process/features/launch-readiness/
  active/       -- active program task folder ({program-slug}_{date}/) holding umbrella + phase plans/reports FLAT
  completed/    -- archived completed program folders
  backlog/      -- deferred/future work (cloud hosting, S3/R2, Stripe checkout, SMTP)
```

All artifacts (umbrella plan, phase plans, reports, registry, references) colocate FLAT inside the program task folder. Do NOT create `reports/` or `references/` sibling dirs.
