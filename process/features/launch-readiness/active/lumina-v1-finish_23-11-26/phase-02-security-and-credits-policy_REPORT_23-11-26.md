---
phase: phase-02-security-and-credits-policy
date: 2026-11-23
status: COMPLETE
feature: launch-readiness
plan: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_PLAN_23-11-26.md
---

# Phase 02 — Security & Staff-Managed Credits Report

## What Was Done

- **Per-record attachment authorization (`backend/src/lib/scope.ts`):** Added
  `canAccessAttachment(db, actor, attachment)` and `assertCanAccessAttachment(...)`.
  - Admin: always allowed.
  - Uploader (`attachments.uploadedBy === actor.sub`): always allowed, covering the
    pre-attach window right after `POST /uploads`.
  - Cancellation-request evidence (`requests.attachmentId`): target/requesting teacher and
    their manager; cross-team managers, other teachers, and students are denied.
  - Lesson-plan files (`lesson_plans.attachmentIds`): mirrors `GET /school/bootstrap` 1:1 —
    manager allowed for a published/owned course or a team lesson using the plan;
    teacher/student allowed when enrolled in the course or assigned to a lesson using the
    plan.
  - Any other unreferenced upload by another user: denied.
- **Enforcement (`backend/src/routes/uploads.ts`):** Both `GET /uploads/:id` and
  `GET /uploads/:id/download` now call `assertCanAccessAttachment` after the `404` lookup, so
  out-of-scope actors receive `403 FORBIDDEN`.
- **Staff-managed credits (`backend/src/routes/credits.ts`):** `POST /credits` is now
  `requireRole(["admin", "manager"])`. Student self-purchase returns `403` without changing the
  balance. Admin and team-scoped manager top-ups/adjustments, the 100-credit per-request cap,
  `lockStudentCredits`, and activity logging are unchanged.
- **Frontend API-mode billing (`frontend/app/lib/school/services/credits.ts`,
  `frontend/app/components/student/StudentBilling.tsx`):** In `isApiDataMode()`,
  `purchaseCredits()` fails fast with a `ServiceError`; the page hides "Buy credits", the
  purchase modal, the auto-renew toggle, and the demo VISA/auto-renew card, and shows a
  "School-managed credits" panel. Real balance, history table, and invoice download remain.
  Demo mode is untouched.
- **Test evidence:**
  - `backend/scripts/smoke.ts`: upload scope matrix expanded (pre-attach uploader/admin 200 vs
    cross-team/student 403; published-plan enrolled roles 200 vs unrelated 403; draft-course
    owner/admin 200 vs others 403; request evidence target teacher/manager 200 vs
    cross-team/student 403) and the credits scenario now asserts student self-purchase `403`
    with an unchanged balance, admin purchase `201`, and 101-hour cap `400`.
  - `backend/tests/contract.test.ts`: new DB-free route contract — `POST /credits` is `401`
    anonymous and `403` for a signed student token (role gate runs before the handler).
  - `frontend/e2e/api/uploads.spec.ts`: second test proves unattached-upload scoping
    (`200` uploader/admin, `403` other manager/student), student `POST /credits` `403`, and
    API-mode Student Billing showing "School-managed credits" with no "Buy credits" button
    and no demo VISA card.
- **Context & backlog reconciled:** Updated
  `process/context/{all-context.md,auth/roles-and-scope.md,database/booking-and-credit-integrity.md,tests/all-tests.md,uxui/school-data-layer.md}`,
  `attachment-access-scope_NOTE_18-11-26.md` (closed), and
  `booking-rules-followups_NOTE_18-11-26.md` (item 3 closed).

## What Was Skipped/Deferred

- Signed download URLs: rejected during INNOVATE — the frontend already downloads through the
  authenticated `requestBlob` helper, so per-record checks were sufficient.
- `frontend/e2e/api/cancellation-refund.spec.ts` was not modified: it exercises the authorized
  evidence path and stayed green as the positive regression.
- Curriculum Library attachment scoping is deferred to Phase 04, which will extend
  `canAccessAttachment`.

## Test Gate Outcomes

All gates ran against default `backend/.env` (`lumina`, NO `DATABASE_URL` override) after
stopping a stale Next dev server that held port 3000.

| Gate | Command | Outcome |
|---|---|---|
| Typecheck | `npm run typecheck` | Green (both workspaces) |
| Lint | `npm run lint` | Green (both workspaces) |
| Backend Vitest | `npm run test --workspace @lumina/backend` | Green (5 files / 31 tests) |
| Live API smoke | `npm run smoke` | Green (14/14 domains, 405 checks, settings restored) |
| Playwright E2E | `npm run e2e` | Green (24/24 API + 3/3 demo) |
| Post-run DB check | Active duplicate groups query | Green (`0` active duplicate groups) |
| Diff hygiene | `git diff --check` | Green |

Regression: booking collision, credit concurrency, cancellation/refund evidence, import,
notifications, homework, and demo mode — PASS.

## Plan Deviations

- **Execution started from a pre-populated working tree.** The Phase 02 source edits and the
  Validate Contract were already uncommitted when EXECUTE began (left by the prior PVL/execute
  preparation). This session audited every edit against the contract, added the missing
  `backend/tests/contract.test.ts` assertion (plan item B3), and ran the full gate set before
  committing.
- **Stale dev server stopped.** A leftover Next dev server from this repo (PID 23840) held
  port 3000; `playwright.config.ts` sets `reuseExistingServer: false` for the app, so it was
  stopped before `npm run e2e`. It is not part of the phase change.
- `cancellation-refund.spec.ts` did not need changes (see deferred list).

## Test Infra Gaps Found

- `npm run e2e` fails fast with `http://localhost:3000 is already used` when any dev server is
  running. Expected per config, but worth a preflight note for future phases; not a code defect.

## SPEC Achievement

Program Charter Tier 2 (Phase 02) criteria:

- **P2-1 (Unauthorized attachment access `403`):** **met** — pre-attach, draft course,
  unrelated course, and cross-team request evidence all return `403` in smoke and e2e.
- **P2-2 (Authorized roles download identical bytes):** **met** — admin, uploader, enrolled
  student/teacher, and published/owned manager paths return `200` with byte-identical content;
  cancellation evidence still downloads for the authorized manager.
- **P2-3 (Student `POST /credits` `403`; staff credits intact):** **met** — student purchase
  `403` with unchanged balance; admin purchase `201`, cap `400`, manager path unchanged.
- **P2-4 (API-mode billing UI; demo intact):** **met** — "Buy credits" and the demo VISA card
  are absent in API mode, and the demo regression suite still exercises local billing/downloads
  with zero `/api/v1/` calls.
- **P2-5 (Static/unit/regression green):** **met** — typecheck, lint, 31 backend tests,
  smoke 14/14 / 405, e2e 24 API + 3 demo, 0 active duplicate groups.

## SPEC Gaps

None for Phase 02. Library-item attachments remain a Phase 04 extension.

## Closeout Packet

1. **Selected plan path:** `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_PLAN_23-11-26.md`
2. **Closeout classification:** `Ready for UPDATE PROCESS archival` (stays inside the active program folder marked `✅ VERIFIED` until all 6 phases finish)
3. **What was finished:** Upload download scoping for every attachment kind, staff-only credit administration in API mode, API-mode student billing UI cleanup, expanded smoke/e2e/contract coverage, and context/backlog reconciliation.
4. **Verified vs. unverified:** All Phase 02 criteria verified on live dev `lumina` through the full gate set. Production/cloud storage hardening remains out of v1 scope.
4b. **Validate-contract compliance:** Present inline in the Phase 02 plan (`Status: PASS`, accepted by user `ENTER EXECUTE MODE`, 23-11-26).
5. **Cleanup done vs. still needed:** Phase report written; 5 context docs + 2 backlog notes + umbrella/plan state updated; execution and process changes committed separately.
6. **Single best next valid state:** Advance to Phase 03 RESEARCH (`process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-03-auth-lifecycle-hardening_PLAN_23-11-26.md`).
7. **Commit-checkpoint recommendation:** Execution commit (`fix(api)` upload scope + credits policy + tests) followed by a process commit (plans/context/backlog/report).
8. **Regression status:** Full smoke (405 checks) and e2e (24 API + 3 demo) passed on default `lumina`.
9. **SPEC achievement:** P2-1 through P2-5 all met.

Drift score: HIGH (3+ signals: 9 source/test files touched, process/context/backlog edits, and
3+ memory-worthy findings). Strongly recommend UPDATE PROCESS.

## Forward Preview

### Test Infra Found
- Default `backend/.env` (`lumina`) runs `npm run smoke` and `npm run e2e` with zero overrides.
- `npm run e2e` requires ports 3000/3100/4000 to be free and never reuses a frontend dev server
  on 3000; stop any `npm run dev` first.
- Contract tests can assert role gates without a DB by signing a `TokenPayload` with
  `app.jwt.sign` and injecting the request (`requireRole` runs before the handler).

### Blast Radius Changes
- Added `backend/tests/contract.test.ts` to the planned blast radius (DB-free credits role
  assertion). All other files stayed within the planned Phase 02 radius.

### Commands to Stay Green
```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
```

### Dependency Changes
- None.
