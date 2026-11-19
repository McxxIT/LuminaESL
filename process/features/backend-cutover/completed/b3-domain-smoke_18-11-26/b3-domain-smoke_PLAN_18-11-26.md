---
name: plan:b3-domain-smoke
description: "COMPLEX plan: committed API smoke per domain, local-vs-API parity fixes, 1-credit-per-lesson unit, numeric-hours crash fix"
date: 18-11-26
feature: backend-cutover
status: COMPLETE (archived 18-11-26; validate gate CONDITIONAL with user-accepted residual R1 plus named known gaps, all backlogged)
---

# B3 Domain Smoke, Parity Fixes, and Numeric-Hours Fix

**Date**: 18-11-26
**Status**: COMPLETED 18-11-26 (EXECUTE done; independent vc-tester EVL rerun green; UPDATE PROCESS closed; archived to `completed/`). Validate-contract Gate CONDITIONAL, residuals accepted by user (R1 frontend test runner, backlog stub exists).
**Complexity**: COMPLEX (4 sequential workstreams, high-risk classes: billing/credits, public API behavior)
**Branch**: developing
**SPEC**: `b3-domain-smoke_SPEC_18-11-26.md` (same folder, locked)
**Execution Model**: single opus vc-execute-agent, sequential: WS-B backend, WS-F frontend, WS-S smoke, V verification

TL;DR: Fix the API-mode crash (numeric strings), make bookings/lessons/requests behave like demo mode, move demo to 1 credit per lesson, then add `npm run smoke` that proves all 20 SPEC criteria against a temporary backend on :4100 without ever resetting the DB.

## Overview

API mode and demo mode disagree in small ways and no repeatable check proves each domain works against the real backend. This plan (1) fixes a verified blocker: `credit_entries.hours` is `numeric`, postgres.js returns strings, bootstrap passes `"12.00"`, the frontend `creditBalance` concatenates, `.toFixed` throws in `notifications.ts:62`, and the API-mode admin shell crashes; (2) fixes the small parity gaps listed in the SPEC Fix Classification; (3) adds a committed smoke script; (4) records browser/evidence results.

Already done and kept (do not redo): `backend/src/routes/bookings.ts` action `booking.created` to `lesson.booked`; `backend/src/routes/lessons.ts` PATCH `/:id` logs `lesson.planChanged`. Both verified live.

## Goals

- 20 SPEC criteria each have a named proving gate (see Verification Evidence).
- Exact numeric credits end to end (typeof number, exact sums, fractional 0.5/1.5).
- 1 credit per lesson in demo and API.
- Smoke is re-runnable, own fixtures, never reset/push/truncate.

## Scope

In: items under SPEC "In scope". Out (recorded as known gaps / backlog): booking-credit race and no unique constraint on lessons (no migration), plan selection unlocked, student self-purchase up to 100 credits with no payment check (asserted as current behavior), smoke not in CI, leave-behind fixtures grow the dev DB, "credit hours" UI wording, rebook enrichment.

## Context Loaded

`process/context/all-context.md`, `tests/all-tests.md`, `database/all-database.md` (+ booking-and-credit-integrity.md), `auth/all-auth.md`, `uxui/school-data-layer.md`, `process/development-protocols/plan-lifecycle.md`, `implementation-standards.md`. Test chain: backend vitest is inject-only and DB-free (`backend/tests/app.test.ts`, `contract.test.ts`, `password.test.ts`); frontend has no tests; no Playwright. Existing files in blast radius with tests: none for bookings/lessons/credits routes. This is why the smoke script is the new Fully-Automated gate.

## Resolved Open Questions (SPEC)

| # | Question | Resolution |
|---|---|---|
| 1 | "credit hours" copy | Deferred; backlog note |
| 2 | API booking enrichment | Match demo (enrollment + next plan + room code) |
| 3 | Smoke name/location/port | `backend/scripts/smoke.ts` (confirm dir is covered by tsconfig/eslint, else add), `npm run smoke --workspace @lumina/backend` + root alias `npm run smoke`, port 4100 (`SMOKE_PORT`) |
| 4 | Approve-cancel on completed lesson | Refuse inside txn, no refund, request stays pending |
| 5 | No absence refund when `refundTeacherCancellations` off | Asserted by smoke (toggle off then restore) |

## Architecture Notes

Data flow (numeric fix): Postgres `numeric` OID 1700 -> postgres.js `types` option parser -> JS `number` -> drizzle rows -> `sum()`/arithmetic in routes -> bootstrap JSON number -> frontend `creditBalance` numeric add -> `.toFixed` safe. `sum(hours)` aggregate returns numeric; with the type parser it also arrives as number (if SQL `::int` casts exist, replace with `getCreditBalance`). Exported const (`NUMERIC_TYPES`/`pgTypes`) in `backend/src/plugins/db.ts` so a DB-free vitest can assert `parse("12.00") === 12`.

Data flow (booking): POST /bookings -> txn { claim slot `DELETE ... RETURNING` -> `getCreditBalance(tx, studentId)` >= 1 -> `resolveLessonDefaults(tx, ...)` (active enrollment, plan at nextPlanIndex + reserved count, planAttachedBy = course owner fallback actor, roomCode `ESL-####` <= 40 chars) -> insert lesson -> insert credit entry -1 -> `logActivity(tx, lesson.booked)` }.

Smoke topology: tsx process -> `buildApp({env})` in-memory env (NODE_ENV=test, RATE_LIMIT_MAX raised) -> `app.listen(127.0.0.1:4100)` -> real HTTP via fetch -> local Postgres. Per-run admin inserted directly via drizzle (random password, `hashPassword`); everything else created via API as that admin; emails `smoke-{runId}-*@smoke.lumina.test`.

Failure modes considered (vc-scenario, three highest-risk items):
1. Numeric parser: other numeric columns now become numbers (any other `numeric` column? Executor greps schema; if any code relied on strings, fix). Parser must not affect `bigint`/`int8` (leave default).
2. Approve-cancel refund: states {scheduled, already cancelled, completed}. scheduled -> cancel + refund once; cancelled -> no second refund, request still resolved approved; completed -> 4xx refuse, request stays pending, no ledger row. Check inside the same txn before status flip, and request row locked or re-read to avoid double approval.
3. Smoke safety: port in use -> fail (never fall back to 4000); production NODE_ENV or remote DB host -> refuse; crash mid-run -> `finally` + SIGINT restore settings (studentLateCancellationHours, refundTeacherCancellations); original values printed at start so manual restore is possible.

Risk predictions (vc-predict 5-persona summary, inline): Skeptic: smoke becomes flaky on shared dev DB, mitigated by per-run fixtures and exact-by-target activity filters. Security: smoke admin password leak, mitigated by random per-run password, never logged, archived at end. Operator: leave-behind data grows, accepted known gap. Maintainer: dual-branch drift, mitigated by mirroring checklist items WS-F. Product: demo unit change shifts visible balances, mitigated by seed check item F6.

## Security Notes (vc-security STRIDE, quick)

- Spoofing/EoP: smoke asserts 403 for wrong role and cross-team manager on every mutation; no auth code changed. Request creation gains lesson-ownership check (tightens).
- Tampering: student purchase of up to 100 credits with no payment check is existing behavior; asserted and recorded, not changed.
- Info disclosure: smoke prints no passwords/tokens; env files untouched.
- Repudiation: activity logging made consistent (typed action union).
- DoS: RATE_LIMIT_MAX only raised inside smoke's in-memory env; default stays 300.
- No public auth/secret surface added; DB guards prevent running against production.

## Touchpoints

Backend (WS-B):
- `backend/src/plugins/db.ts` (types option + exported const)
- `backend/src/config/env.ts` (optional `RATE_LIMIT_MAX`, default 300), `backend/src/app.ts:116`
- `backend/src/lib/credits.ts` (new: `getCreditBalance`)
- `backend/src/lib/lesson-defaults.ts` (new: `resolveLessonDefaults`)
- `backend/src/lib/activity.ts` (`ActivityAction` superset union, db-or-tx)
- `backend/src/routes/bookings.ts`, `lessons.ts`, `credits.ts`, `requests.ts`, slot handlers (bookings.ts POST /bookings/slots, DELETE /bookings/slots/:id; requests.ts slot-closure approve/withdraw), `school.ts` (bootstrap numeric; `school.ts:24` `SCHOOL_SCHEMA_VERSION`), `backend/src/routes/notifications.ts:40` (`LOW_CREDIT_HOURS = (25/60)*2`, review for unit change)
- `backend/tests/` new DB-free vitest(s): numeric parser, `ActivityAction`/env default

Frontend (WS-F):
- `frontend/app/lib/school/api/teaching.ts` (add `rateLesson`)
- `frontend/app/lib/school/services/quality.ts` (rateLesson dual-branch), student UI callers of rateLesson
- `frontend/app/lib/school/services/common.ts` (`LESSON_CREDIT_HOURS = 1`), `bookings.ts`, `approvals.ts`, request service (attachment in API mode), `frontend/app/components/manager/ManagerSchedule.tsx`, `frontend/app/components/LuminaApp.tsx` (24.5 hardcode), `frontend/app/lib/school/seed.ts` (balances, packages), `frontend/app/lib/school/types.ts` (only if schema version bump needed; keep `backend/tests/contract.test.ts` in sync)
- `frontend/app/lib/school/selectors.ts` (read only, verify `creditBalance`)
- Additional frontend (Gap 3): `frontend/app/lib/school/notifications.ts:40`, `frontend/app/components/student/StudentBilling.tsx:70`, `frontend/app/components/student/StudentOverview.tsx:145`, `frontend/app/lib/data.ts` (creditPackages/transaction seed); `SCHOOL_SCHEMA_VERSION` 2 to 3 in `frontend/app/lib/school/types.ts:8` and `backend/src/routes/school.ts:24`.

Smoke (WS-S): `backend/scripts/smoke.ts` (new), `backend/package.json` (`smoke` script, lint `eslint src tests scripts`), `backend/tsconfig.json` (include `scripts/**/*.ts`), root `package.json` alias.

Docs (V): `frontend/CUTOVER_PROGRESS.md`, `process/context/tests/all-tests.md`, `process/context/all-context.md` (RATE_LIMIT_MAX, smoke command, stale `::int` fix), `process/context/database/booking-and-credit-integrity.md` (stale `::int` and test-count fix), backlog note in `process/features/backend-cutover/backlog/`.

## Public Contracts

- POST /bookings and POST /lessons: omitted `planId`/`enrollmentId`/`roomCode` now auto-filled (behavior addition, explicit values still win). Rebook unchanged.
- POST /lessons/:id/complete: 4xx on cancelled lesson (new rejection).
- POST /requests (lesson-cancellation): rejects lesson not belonging to the requesting teacher (new 4xx).
- Approve lesson-cancel request: refuses completed lesson; no refund on already cancelled.
- Activity action names: superset union (see B9). New/renamed: `lesson.booked` (POST /bookings, rebook, POST /lessons; replaces `lesson.created`), `lesson.rescheduled`, `lesson.planChanged`, `slot.opened`, `slot.closed` (backend-only), `request.created`, `request.withdrawn` (backend-only), with `targetType: "slot"` and the real slot id for slot actions. No `lesson.rebooked`. Existing backend names retained.
- Numbers: all credit `hours` in API JSON are JSON numbers; `GET /credits/balance` `balance` changes from string to number.
- Env: `RATE_LIMIT_MAX` optional (default 300); `Env` type requires it after parsing.
- Shared contract: `SCHOOL_SCHEMA_VERSION` bumps 2 to 3 in both frontend `types.ts` and backend `school.ts` (contract.test.ts enforces equality); bootstrap collection keys unchanged.

## Blast Radius

~25-30 files across backend, frontend, docs. Risk class HIGH (credits ledger arithmetic, booking behavior, public API additions). No schema/migration. No new dependencies. Rollback: all changes are code-only and uncommitted until verified; `git revert` of the single execution commit restores prior behavior; smoke fixtures are inert rows (archived users) and settings are restored in `finally`; no migration to undo. If the numeric parser causes regressions, revert only `plugins/db.ts` and `getCreditBalance` casts.

## Implementation Checklist

### WS-B Backend (do first)

B1. `backend/src/plugins/db.ts`: add exported `pgTypes` = `{ numeric: { to: 1700, from: [1700], serialize: (x: number | string) => String(x), parse: (x: string) => Number(x) } }` (the `from: [1700]` is REQUIRED: postgres.js registers parsers only from `from`) and pass `types: pgTypes` to `postgres(...)`. Do not touch bigint/int8.
B2. New `backend/tests/db-types.test.ts` (DB-free): assert `pgTypes.numeric.to === 1700`, `pgTypes.numeric.from` contains 1700, and parser registration via `const c = postgres("postgres://x", { types: pgTypes }); c.options.parsers[1700]("12.00") === 12` and `("-0.50") === -0.5` (postgres.js connects lazily; no DB). A test asserting only `to` is insufficient.
B3. `backend/src/config/env.ts`: add `RATE_LIMIT_MAX` (coerce positive int, default 300); `app.ts:116` use `env.RATE_LIMIT_MAX`. Because `Env` now requires the field, add `RATE_LIMIT_MAX: 300` to the Env literals in `backend/tests/app.test.ts` and `backend/tests/contract.test.ts`, and add a test that parsing an env without it yields 300.
B4. New `backend/src/lib/credits.ts`: `getCreditBalance(db|tx, studentId): Promise<number>` using `coalesce(sum(hours),0)` with no `::int` cast, returned as number.
B5. Refactor to `getCreditBalance` in POST /bookings (inside txn), rebook (`lessons.ts` ~469, fractional 1.5 ok / 0.5 refused, compare `>= 1`), GET /credits/balance (note: `balance` changes from string to number, a public contract change; no frontend reader of `.balance`). Raw sums are already `::numeric` since commit 6819b3d, so the earlier "`::int` truncation" premise is stale; this is a refactor, not a truncation fix. `seed.ts`/`reset.ts` use their own clients, unaffected.
B6. `backend/src/routes/school.ts:566`: ensure bootstrap credit `hours` is number (guaranteed by B1; add `Number()` only if a raw SQL path bypasses types).
B7. New `backend/src/lib/lesson-defaults.ts` `resolveLessonDefaults(db|tx,{teacherId,studentId,actorId})` mirroring frontend `services/common.ts createLesson`: active enrollment for pair, plan at `nextPlanIndex` + count of reserved (scheduled) lessons, `planAttachedBy` = course owner fallback actor, `roomCode` `ESL-` + 4 digits (<=40 chars). Returns nulls cleanly when no enrollment.
B8. POST /bookings (in txn) and POST /lessons (omitted fields only) call it.
B9. `backend/src/lib/activity.ts`: `ActivityAction` string-literal SUPERSET union: the frontend names (absence.recorded, course.*, credits.adjusted, enrollment.created, homework.assigned/submitted/reviewed, lesson.booked/cancelledByStudent/completed/planChanged/rated/rescheduled, manager.created, request.created/approved/rejected, settings.updated, slot.opened, student.created/updated, teacher.created/reassigned/updated, user.renamed/active/inactive) PLUS every action string currently used in backend (grep `action:` and `logActivity(` across `backend/src`): retain `credits.purchased`, `credits.refunded`, `enrollment.updated`, `student.reassigned`, `user.updated`, `user.archived`, `course.archived`, and the templated `user.${status}`, `request.${status}`, `course.${status}`; plus new `slot.closed`, `request.withdrawn`. The only rename is POST /lessons `lesson.created` to `lesson.booked`. Rebook logs `lesson.booked` (demo rebook goes through createLesson); do NOT add `lesson.rebooked`. `logActivity(db|tx, input)` first param typed `PgDatabase<PostgresJsQueryResultHKT, typeof schema>` (accepts both `db` and `tx`; `PostgresJsDatabase` as used in `lib/scope.ts` does not accept a tx). Typecheck forces remaining call sites onto union members.
B10. Move raw `tx.insert(activity)` in bookings/credits/requests to `logActivity`.
B11. Add logging: slot opened (`POST /bookings/slots`, bookings.ts ~77-123) and closed (`DELETE /bookings/slots/:id` ~125-146, plus requests.ts slot-closure approve/withdraw paths) using `targetType: "slot"`, `targetId` = the real slot id; rebook (`lesson.booked`), reschedule, request created/withdrawn; POST /lessons logs `lesson.booked`. Exactly one row per mutation. `request.withdrawn` and `slot.closed` are backend-only additions (demo logs neither): accepted divergence, record in CUTOVER_PROGRESS.
B12. POST /lessons/:id/complete rejects cancelled lesson (409/422 via errors helper, state unchanged).
B13. POST /requests lesson-cancellation: unknown lesson returns 404; compare `lesson.teacherId` to the EFFECTIVE teacherId of the request (the body `teacherId` when admin/manager file on behalf, else the actor), not the actor, else 4xx.
B14. Approve-cancel (`POST /requests/:id/review`): inside the txn add a `status = "pending"` predicate to the review update (double-approval safe; zero rows updated means 409), and check lesson status BEFORE the cancel update: completed -> throw (rollback keeps request pending, no refund); already cancelled -> resolve without refund; scheduled -> cancel + refund +1 once.
B15. Gate: `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` green.

### WS-F Frontend

F1. `api/teaching.ts`: `rateLesson` -> POST `/lessons/:id/ratings` `{score,comment,from}`.
F2. `services/quality.ts rateLesson`: dual-branch (`isApiDataMode()` -> `runAsync` + `refreshSchoolAfterCommand`; local unchanged). Check every student UI caller handles the now-possibly-async result.
F3. Request service `requestLessonCancellation` (API mode) is two-step: first check `frontend/app/lib/school/api` for an existing upload helper; else convert `dataUrl` to Blob, build FormData and POST `/uploads` (client `request()` supports FormData), then POST `/requests` with the returned `attachmentId`. Local branch unchanged.
F4. `common.ts`: `LESSON_CREDIT_HOURS = 1` (drop 25/60); confirm `bookings.ts`, `approvals.ts`, `ManagerSchedule.tsx` need no further edits (they read the constant). Also fix `frontend/app/lib/school/notifications.ts:40` (`LOW_CREDIT_HOURS = (25/60)*2`), `components/student/StudentBilling.tsx:70` and `components/student/StudentOverview.tsx:145` (divide by 25/60). Gate: grep `25 / 60` and `LESSON_SLOT_MINUTES / 60` shows no remaining credit math.
F5. Mirror local `approvals.ts`: approve-cancel refuses completed lesson, no double refund on cancelled.
F6. Side effects: `seed.ts` balances and "5 hours buys 12 lessons" package comment/values, `frontend/app/lib/data.ts` creditPackages/transaction seed, `LuminaApp.tsx` hardcoded 24.5 (lines 32/143/158), seed reconcile entry (seed.ts:261-263). BUMP `SCHOOL_SCHEMA_VERSION` 2 to 3 in BOTH `frontend/app/lib/school/types.ts:8` and `backend/src/routes/school.ts:24` (`contract.test.ts` enforces equality; persisted `lumina-school:v1` stores hold -25/60 debits and would inflate on cancel). Restart the backend before API-mode browser checks (bootstrap rejects version mismatch).
F7. Gate: root `npm run typecheck`, `npm run lint`.

### WS-S Smoke

S1. `backend/scripts/smoke.ts`: guards (refuse original `NODE_ENV=production`, refuse non-local `DATABASE_URL` host unless `SMOKE_ALLOW_REMOTE`, set `NODE_ENV=test` in in-memory env, raise `RATE_LIMIT_MAX`, set `UPLOAD_DIR` in the in-memory env to an OS temp subfolder so uploads never land in `backend/uploads`, load `.env` read-only, never write env files, fail if port 4100/`SMOKE_PORT` in use), print original settings, SIGINT + `finally` restore: settings (defaults 24 / true if no row existed), then archive the directly-inserted smoke admin via drizzle (login needs status active), then archive API-created users best effort, then close app and postgres client.
S2. Fixtures: per-run admin via drizzle + `hashPassword`; via API: managers A and B, teachers/students on each, course + units + plans, enrollment, credits, slots, lessons.
S3. Scenarios, each with allowed role OK / denied roles 403 / cross-team manager 403 / exact credit delta / exactly one activity row via admin GET `/activity` filtered by target:
  slots; booking (double book fails no second debit, 0 credits fails no lesson); on-behalf; rebook (1.5 ok, 0.5 refused); lessons (schedule via POST /lessons, reschedule, early cancel at +10d, late cancel at +1d no refund with `studentLateCancellationHours=72`, complete, cancelled-complete rejected, teacher absence refund and no refund when `refundTeacherCancellations` off, past-start lesson via yesterday date); requests (create/withdraw/approve/reject, approve-cancel +1 once, already-cancelled no refund, completed refused/pending, foreign lesson rejected, attachment read-back); credits (student purchase self-only, other 403, fractional adjust, own-team manager scope, balance == ledger sum, typeof number on bootstrap/GET/POST); homework (assign/submit empty rejected/review/review twice 400); quality/settings (rate completed, 1-5, duplicate 409, non-completed rejected, admin-only settings, out-of-range rejected, settings.updated logged); profile (4 roles self-rename, others 403, status change rules); enrichment fields on booked lesson (plan, enrollment, roomCode matches `ESL-\d{4}`, <=40); student shell/bootstrap numeric check.
S4. Per-domain pass/fail output, exit 0/1, restore settings, best-effort archive smoke users, close app.
S5. `backend/package.json` `"smoke": "tsx scripts/smoke.ts"`; root alias `"smoke": "npm run smoke --workspace @lumina/backend"`. Exact coverage changes: `backend/tsconfig.json` include add `"scripts/**/*.ts"`; lint script becomes `eslint src tests scripts` (`eslint.config.mjs` needs no change). smoke.ts must use no `any` (parse JSON as `unknown`) and `import type` (verbatimModuleSyntax, noUncheckedIndexedAccess). vitest only collects `tests/**/*.test.ts`, so smoke is never picked up.
S6. Grep gate: `grep -inE "db:reset|db:push|truncate|drop table|reset\.ts" backend/scripts/smoke.ts` returns nothing.

### V Verification and Docs

V1. Gates: typecheck, lint, backend tests, `git diff --check`.
V2. `npm run smoke` twice consecutively (needs Postgres + backend env file); plus one deliberately broken run (temporarily wrong expected delta, then revert) to prove it turns red.
V3. Agent browser checks (hybrid): demo mode (balance moves by exactly 1 on book and cancel); API mode (admin, teacher, student shells load without crash; rating from student reaches backend; booked lesson page shows plan and room code).
V4. vc-risk-evidence-pack for credits/booking: commands run, balances before/after, activity rows, settings restore proof, known-gap statement.
V5. Update `frontend/CUTOVER_PROGRESS.md` (smoke commands, pass counts, date, browser results, backend-only activity names divergence), `process/context/tests/all-tests.md`, `process/context/all-context.md` (RATE_LIMIT_MAX, smoke command), and correct the stale `::int` truncation claims and test-count statements in `process/context/database/booking-and-credit-integrity.md`, `all-context.md` ("Observed booking risks"), and `all-tests.md` (Known Gaps); write backlog notes: "credit hours" wording; rebook enrichment; concurrency/unique constraint; smoke in CI.

## Phase Completion Rules

A workstream is CODE DONE when its checklist items are applied and its gate is green. The plan is VERIFIED only with: all four standing gates green, two consecutive smoke runs green, browser checks logged, evidence pack written, and user confirmation. Known-Gap is never a proving strategy; known gaps listed above have backlog notes and the affected gates stay CONDITIONAL.

## Acceptance Criteria (SPEC mapping, each with proving gate)

| SPEC # | Proven by (gate) | Strategy |
|---|---|---|
| 1 | G-SMOKE-RUN, G-SMOKE-RED | Fully-Automated |
| 2 | G-SMOKE-TWICE | Fully-Automated |
| 3 | G-GREP, review of S1 guards | Fully-Automated |
| 4 | G-DOC (CUTOVER_PROGRESS diff) | Agent-Probe |
| 5 | smoke slots | Fully-Automated |
| 6 | smoke booking | Fully-Automated |
| 7 | smoke on-behalf | Fully-Automated |
| 8 | smoke rebook | Fully-Automated |
| 9 | smoke lessons | Fully-Automated |
| 10 | smoke lessons (cancelled-complete) | Fully-Automated |
| 11 | smoke enrichment fields + G-BROWSER-API | Hybrid |
| 12 | smoke requests | Fully-Automated |
| 13 | smoke requests (refund once, cancelled, completed, foreign lesson) | Fully-Automated |
| 14 | smoke request attachment read-back | Fully-Automated |
| 15 | smoke credits | Fully-Automated |
| 16 | typecheck/lint + G-BROWSER-DEMO | Hybrid |
| 17 | smoke homework | Fully-Automated |
| 18 | smoke quality/settings + G-BROWSER-API rating | Hybrid |
| 19 | smoke profile | Fully-Automated |
| 20 | smoke activity assertions | Fully-Automated |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G-SMOKE-RUN: `npm run smoke` exit 0 | Fully-Automated | 1 |
| G-SMOKE-RED: deliberate break turns smoke red (temporary, reverted) | Fully-Automated | 1 |
| G-SMOKE-TWICE: two consecutive `npm run smoke` | Fully-Automated | 2 |
| G-GREP: no reset/push/truncate strings; production/remote guards present | Fully-Automated | 3 |
| G-DOC: CUTOVER_PROGRESS.md records commands, counts, date | Agent-Probe | 4 |
| smoke slots scenario | Fully-Automated | 5 |
| smoke booking scenario | Fully-Automated | 6 |
| smoke on-behalf scenario | Fully-Automated | 7 |
| smoke rebook scenario | Fully-Automated | 8 |
| smoke lessons scenario | Fully-Automated | 9, 10 |
| smoke enrichment fields + G-BROWSER-API lesson page | Hybrid | 11 |
| smoke requests scenario | Fully-Automated | 12, 13, 14 |
| smoke credits scenario + db-types vitest + bootstrap typeof number | Fully-Automated | 15 |
| typecheck + lint + G-BROWSER-DEMO (balance moves by 1) | Hybrid | 16 |
| G-BROWSER-DEMO extended list (fresh demo store after version bump): on-behalf booking -1, rebook -1, early cancel +1, teacher absence +1, approve-cancel +1 exactly once, approve-cancel on completed lesson refused | Agent-Probe | 16 (FE-PARITY) |
| smoke homework scenario | Fully-Automated | 17 |
| smoke quality/settings + G-BROWSER-API student rating | Hybrid | 18 |
| smoke profile scenario | Fully-Automated | 19 |
| smoke activity assertions per mutation | Fully-Automated | 20 |
| `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `git diff --check` | Fully-Automated | standing gates |
| risk evidence pack (credits/booking) | Agent-Probe | high-risk closure |

Hybrid preconditions: local Postgres 15+ with migrated schema, backend env file present, frontend dev server for browser checks. Known gaps (race, no unique constraint, self-purchase cap, not in CI, fixture growth) each get a backlog note; related gates stay CONDITIONAL.

Failing stubs (TDD, for validate-contract, not on disk): `test("should parse numeric 12.00 as number 12", () => { throw new Error("NOT IMPLEMENTED") })`; `test("should default RATE_LIMIT_MAX to 300", () => { throw new Error("NOT IMPLEMENTED") })`.

## Test Infra Improvement Notes

- Backend vitest has no DB; smoke is the only DB-backed gate and is not in CI (known gap, backlog).
- No frontend tests; browser checks stay agent-run.
- Possible later: test database + fixture framework (out of scope here).

## Dependencies and Sequencing

WS-B before WS-F (frontend mirrors backend rules), WS-S after both (asserts final behavior), V last. Verified ordering: no step depends on a later step's output.

## Risks

| Risk | Mitigation |
|---|---|
| Numeric parser alters other numeric columns | grep schema for numeric columns; typecheck; smoke typeof asserts |
| Demo unit change leaves stale persisted store | F6 decision + browser demo check |
| Smoke leaves settings changed after crash | finally + SIGINT restore, originals printed |
| Smoke run against wrong DB | host guard, production refusal, NODE_ENV=test |
| Rate limit trips smoke | RATE_LIMIT_MAX raised in smoke env only |

## Validator Expectations

`node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs <this plan>`; before closure the change-type validators: `validate-context-discovery.mjs` (context edits), `validate-plan-inventory.mjs` (plan edits).

## Validate Contract

Status: CONDITIONAL
Date: 18-11-26
date: 2026-11-18
generated-by: outer-pvl
supersedes: 2026-11-18 (outer-pvl) — first-pass CONDITIONAL contract (Gap 1-9 open); PVL supplement cycle 1 applied all 9 gaps and this re-validate has current evidence

Parallel strategy for EXECUTE: sequential (one opus vc-execute-agent: WS-B, WS-F, WS-S, V; EVL by a spawned sonnet vc-tester)
Rationale: signal score 3/7 (S2 public API/billing surface, S6 high-risk class billing/credits, S7 25-30 files). S1/S3/S4/S5 absent. WS-F mirrors WS-B rules and WS-S asserts both, so the order is strictly dependent; a team or fan-out would add cost for no speed-up.
Validate fan-out note: Layer 1 (4 dimensions) and Layer 2 (4 sections) ran as direct read-only analysis by the validate agent (a spawned subagent has no Agent tool). Evidence is file reads of the live tree plus one empirical check (see Gap 1 re-verification).

### Gap 1-9 re-verification (supplement cycle 1, checked against plan text AND live tree)

| Gap | Plan text now | Live-tree evidence | Verdict |
|---|---|---|---|
| 1 pgTypes `from` | B1 has `from: [1700]`; B2 asserts `c.options.parsers[1700]("12.00") === 12` and `("-0.50") === -0.5` | Ran postgres.js 3.4.9: with `from:[1700]` parsers[1700] is a function (12, -0.5); WITHOUT `from` it is undefined, so the supplemented test genuinely catches the bug | RESOLVED |
| 2 Env literals | B3 names `tests/app.test.ts` and `tests/contract.test.ts`, adds `RATE_LIMIT_MAX: 300`, default-300 test | Both files declare `const env: Env = {...}` (app.test.ts:6, contract.test.ts:49); `app.ts:116` is `max: 300` literal today | RESOLVED |
| 3 25/60 sites + version | F4/F6 + Touchpoints list `notifications.ts:40`, `StudentBilling.tsx:70`, `StudentOverview.tsx:145`, `data.ts`, `LuminaApp.tsx` 32/143/158, `seed.ts:261-263`, both `SCHOOL_SCHEMA_VERSION` | grep confirms every one of those sites; both constants are `= 2` (types.ts:8, school.ts:24); `common.ts:10` is `LESSON_SLOT_MINUTES / 60` | RESOLVED (one stale path, see E9) |
| 4 ActivityAction | B9 superset + retained names, `lesson.booked` for rebook, no `lesson.rebooked`, `logActivity` typed `PgDatabase<PostgresJsQueryResultHKT, typeof schema>`; B10 moves raw inserts (assignments x3, bookings, credits, requests) | `activity.ts` types `Db = PostgresJsDatabase` (tx not assignable) and `action: string`; raw `insert(activity)` sites match B10 | RESOLVED (retained list is partial, grep is authoritative, see E11) |
| 5 B13/B14 | B13 effective teacherId + 404; B14 `status = "pending"` predicate + lesson status checked before cancel update | requests.ts today: pending check is OUTSIDE the txn, update has no status predicate, cancel update runs on any lesson status; teacherId is `request.user.sub` for teachers else `body.teacherId`, and no lesson ownership check exists | RESOLVED |
| 6 uploads | F3 two-step (check for helper, else dataUrl to Blob to FormData POST `/uploads`, then `/requests` with `attachmentId`); S1 temp `UPLOAD_DIR`, finally archives smoke admin | No upload helper in `frontend/app/lib/school/api/*`; client `send()` supports FormData; `uploads.ts` POST is `app.authenticate` (any role), returns the attachment row (id); `createRequest` API path currently drops the attachment | RESOLVED |
| 7 FE-PARITY | Verification Evidence row lists on-behalf -1, rebook -1, early cancel +1, teacher absence +1, approve-cancel +1 once, approve-cancel on completed refused; fresh demo store after bump | Local `approvals.ts` today cancels any non-cancelled lesson (completed included) and refunds, so the F5 change is real and the probe list matches it | RESOLVED (Agent-Probe, see residual R1) |
| 8 stale docs | V5 lists `booking-and-credit-integrity.md`, `all-context.md` "Observed booking risks", `all-tests.md` Known Gaps | Stale `::int` text confirmed at `all-context.md:245`, `booking-and-credit-integrity.md:16,35`, `all-tests.md:101` | RESOLVED |
| 9 scripts/ coverage | S5: tsconfig include `scripts/**/*.ts`, lint `eslint src tests scripts`, no `any`, `import type` | tsconfig include and `"lint": "eslint src tests"` confirmed; `backend/scripts/` does not exist yet | RESOLVED |

Also verified: B5 is worded as a refactor (casts already `::numeric`); GET `/credits/balance/:studentId` string to number is acknowledged as a public contract change in B5 and Public Contracts; Verification Evidence/Acceptance tables cover all 20 SPEC criteria with a named gate each.

### Test gates

C3 table (strategy is only Fully-Automated / Hybrid / Agent-Probe; Known-Gap is a named residual below, never a strategy). gap-resolution: A proven now, B fixed/added by this plan's checklist, C deferred to a named later plan, D backlog test-building stub.

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| SG-1 | typecheck, lint, backend vitest, whitespace check stay green | Fully-Automated | `npm run typecheck`; `npm run lint`; `npm run test --workspace @lumina/backend`; `git diff --check` | A |
| SPEC-1 | smoke runs on :4100, exits non-zero on any failure | Fully-Automated | `npm run smoke` exit 0; G-SMOKE-RED (temporary wrong expected delta turns it red, then revert) | B |
| SPEC-2 | second consecutive run passes, fresh fixtures | Fully-Automated | `npm run smoke` twice back to back | B |
| SPEC-3 | no reset/push/truncate; production and remote-DB refusal | Fully-Automated | `grep -inE "db:reset\|db:push\|truncate\|drop table\|reset\.ts" backend/scripts/smoke.ts` prints nothing; guard code review | B |
| SPEC-4 | results logged in progress board | Agent-Probe | diff review of `frontend/CUTOVER_PROGRESS.md` (commands, pass counts, date, browser results) | B |
| SPEC-5 | slot open/close: role allow/deny, cross-team 403, activity | Fully-Automated | smoke slots scenario | B |
| SPEC-6 | student booking -1, slot removed, `lesson.booked`, double-book fails, 0 credits fails | Fully-Automated | smoke booking scenario | B |
| SPEC-7 | on-behalf booking -1, own team only | Fully-Automated | smoke on-behalf scenario | B |
| SPEC-8 | rebook -1; 1.5 ok, 0.5 refused | Fully-Automated | smoke rebook scenario | B |
| SPEC-9,10 | schedule/reschedule/cancel/complete/absence states, refunds, cancelled-complete rejected | Fully-Automated | smoke lessons scenario | B |
| SPEC-11 | booked lesson has plan, enrollment, room code | Hybrid | smoke enrichment assertions (`ESL-\d{4}`, <=40) + G-BROWSER-API lesson page (precondition: Postgres + backend env + dev server) | B |
| SPEC-12,13,14 | request create/withdraw/approve/reject, refund once, cancelled/completed/foreign-lesson cases, attachment read-back | Fully-Automated | smoke requests scenario (`POST /requests/:id/review`, `POST /requests/:id/withdraw`, `POST /uploads` then `attachmentId`) | B |
| SPEC-15 | purchase self only, fractional adjust, balance == ledger sum, typeof number | Fully-Automated | smoke credits scenario + db-types vitest + bootstrap typeof assertion | B |
| SPEC-16 | demo and API agree on 1 credit per lesson | Hybrid | typecheck + lint + G-BROWSER-DEMO (precondition: frontend dev server, fresh demo store after version bump) | B |
| SPEC-17 | homework assign/submit/review rules | Fully-Automated | smoke homework scenario | B |
| SPEC-18 | rating rules, settings admin-only and bounded, settings.updated | Hybrid | smoke quality/settings scenario + G-BROWSER-API student rating (precondition: API-mode browser, restarted backend) | B |
| SPEC-19 | 4 roles self-rename, others 403, status rules | Fully-Automated | smoke profile scenario | B |
| SPEC-20 | activity names match demo, no duplicates | Fully-Automated | smoke activity assertions (exactly one row per mutation, filtered by targetType+targetId) | B |
| DB-TYPES | numeric OID 1700 parsed to number; env default 300 | Fully-Automated | new `backend/tests/db-types.test.ts` (parser registered via `from`, "12.00" -> 12, "-0.50" -> -0.5) + RATE_LIMIT_MAX default-300 test in `npm run test --workspace @lumina/backend` | B |
| FE-PARITY | frontend local branch uses 1 credit/lesson for on-behalf, rebook, early cancel, teacher absence, approve-cancel; approve-cancel refuses completed lesson; no double refund | Agent-Probe | extended G-BROWSER-DEMO list (Verification Evidence row, Gap 7); precondition: fresh demo store after schema bump; named residual R1 (no automated gate possible: frontend has no test runner) | B, D (backlog stub: frontend test runner) |
| RISK-PACK | credits/booking high-risk evidence | Agent-Probe | `vc-risk-evidence-pack` files in `{task folder}/harness/` (risk-gate, context-snippets, verification, review-decision, adversarial-validation) | B |

Legacy line form (retained for existing consumers):
- Backend vitest/typecheck/lint: [Fully-automated: `npm run typecheck` ; `npm run lint` ; `npm run test --workspace @lumina/backend` ; `git diff --check`]
- Smoke (all 7 domains): [Fully-automated: `npm run smoke` x2 + G-SMOKE-RED + G-GREP] | [hybrid: needs local Postgres 15+ migrated, backend env file, port 4100 free]
- Browser: [agent-probe: demo mode book/cancel/on-behalf/rebook/absence/approve-cancel balance deltas of exactly 1] | [hybrid: API mode admin, teacher, student shells load; student rating reaches backend; booked lesson page shows plan and room code]
- Named residual (known-gap, backlog stubs): R1 frontend local-branch parity rests on Agent-Probe only (no frontend test runner); booking/credit race; no unique constraint on lessons; unlocked plan selection; student self-purchase up to 100 credits (asserted as current behavior); smoke not in CI; leave-behind fixtures; "credit hours" wording; rebook enrichment

Net-gate vacuous-green check: every developed behavior has at least one proving gate. Backend behavior has Fully-Automated smoke/vitest gates. Frontend local-branch behavior (F4 unit, F5 completed-lesson refusal, F3 upload path, F2 local rating) has NO automated gate; it is proven only by non-repeatable Agent-Probe browser checks plus compile-level typecheck/lint. Agent-Probe is a legal proving strategy, not Known-Gap, so this is not vacuously green, but a terminal PASS would overstate it. Classified honestly as CONDITIONAL with R1 named.

Failing stubs (Fully-Automated rows; destined for execute-agent red-first start; NOT on disk):

```
test("should parse numeric 12.00 as number 12", () => { throw new Error("NOT IMPLEMENTED — TDD stub: should parse numeric 12.00 as number 12") })
test("should register the numeric parser for OID 1700 via the from option", () => { throw new Error("NOT IMPLEMENTED — TDD stub: numeric parser registered") })
test("should default RATE_LIMIT_MAX to 300", () => { throw new Error("NOT IMPLEMENTED — TDD stub: should default RATE_LIMIT_MAX to 300") })
// smoke scenarios are script assertions, not vitest; each starts as a thrown "NOT IMPLEMENTED" scenario function:
// scenario("slots"), ("booking"), ("on-behalf"), ("rebook"), ("lessons"), ("requests"), ("credits"), ("homework"), ("quality-settings"), ("profile"), ("activity")
//   -> throw new Error("NOT IMPLEMENTED — TDD stub: smoke <scenario>")
```

### Resolved open items (answered from the live tree, 18-11-26)

1. Slot handlers: `backend/src/routes/bookings.ts`. Open = `POST /bookings/slots` (~L77-123, roles admin/manager/teacher, manager must own teacher, 409 on duplicate), close = `DELETE /bookings/slots/:id` (~L125-146; admin, manager owning the teacher, the slot's own teacher; a student gets 403). Neither logs activity today. `requests.ts` slot-closure approval deletes the slot with no `slot.closed`. Use `targetType: "slot"`, `targetId: slot.id` (demo uses `"${date} ${time}"`, not a DB id; smoke filters by the real id).
2. `backend/scripts/` does not exist and is not covered: tsconfig `include` is `src/**/*.ts, tests/**/*.ts, drizzle.config.ts, vitest.config.ts`; lint is `eslint src tests`. Exact change is in S5. `vitest.config.ts` only collects `tests/**/*.test.ts`. smoke.ts constraints: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, no `any`.
3. Numeric columns: exactly one, `credit_entries.hours` (`numeric(8,2)`, no migration). Raw balance sums: `bookings.ts:185` and `credits.ts:113` (`::numeric`) and `lessons.ts:469` (no cast); all compare `< 1`. GET `/credits/balance/:studentId` returns a string `balance` today and becomes a number (public contract change; no frontend reader of `.balance` found). The `::int` truncation documented in three context docs is stale (removed in commit 6819b3d).
4. Activity names: demo logs `lesson.booked` for BOTH booking and rebook; no `lesson.rebooked`. `request.withdrawn` and `slot.closed` are backend-only (demo logs neither): accepted divergence, record in CUTOVER_PROGRESS.
5. postgres.js 3.4.9 registers parsers only from `from` (empirically confirmed again in this cycle). drizzle-orm 0.38.4 does not touch OID 1700.
6. `SCHOOL_SCHEMA_VERSION`: bump 2 -> 3 in BOTH `frontend/app/lib/school/types.ts:8` and `backend/src/routes/school.ts:24`; `contract.test.ts` enforces equality; API-mode bootstrap rejects a mismatch so restart the backend before browser checks.

### Execute-agent instructions

- E1: Apply the plan checklist as written (Gap 1-9 are already in B1-B14, F3-F6, S1, S5, V5); the Resolved items above are binding context.
- E2: Never run `db:reset`, `db:push`, truncate, or any destructive DB command (also not as a gate). Smoke never writes env files and never listens on 4000.
- E3: `logActivity`, `getCreditBalance`, `resolveLessonDefaults` accept a db OR a transaction. `Db` in `lib/scope.ts`/`lib/activity.ts` is `PostgresJsDatabase` and a `tx` is not assignable; type the helper parameter as `PgDatabase<PostgresJsQueryResultHKT, typeof schema>` (or a `Pick<..., "insert"|"select">`).
- E4: Do not rename existing backend-only activity names; the only rename is POST /lessons `lesson.created` -> `lesson.booked`.
- E5: Smoke `finally`: restore settings (no settings row originally: restore defaults 24 / true), then set the directly-inserted smoke admin to `archived` via drizzle (login requires `status === "active"`), then archive API-created users best effort, then close the app and the postgres client. `UPLOAD_DIR` in the smoke in-memory env is an OS temp subfolder.
- E6: Browser check order: bump version, restart backend, reseed the demo store ("Reset demo workspace") before G-BROWSER-DEMO.
- E7: Docs (V5) correct the stale `::int` statements in `booking-and-credit-integrity.md` (L16, L35), `all-context.md` (L245), `all-tests.md` (L101 and test count) and add RATE_LIMIT_MAX + the smoke command to `all-context.md` and `all-tests.md`.
- E8: High-risk pack path: `process/features/backend-cutover/active/b3-domain-smoke_18-11-26/harness/` (no sibling `reports/`).
- E9: Touchpoint correction: `backend/src/routes/notifications.ts` has NO `LOW_CREDIT_HOURS` or credit-unit math (grep verified). The real constant is `frontend/app/lib/school/notifications.ts:40` (already listed in F4/Touchpoints). Confirm the backend file has no unit math and make no edit there unless the grep finds some; do not invent one.
- E10: `slot.closed` is logged only on `DELETE /bookings/slots/:id` and on slot-closure APPROVE. Withdraw logs `request.withdrawn` only (its slot re-insert is a defensive no-op for a pending request); never `slot.closed` or `slot.opened` on withdraw. One slot-closure approve writes `request.approved` (target request) plus `slot.closed` (target slot): smoke filters by target so each target has exactly one row.
- E11: `ActivityAction` retained-name list in B9 is partial. The grep of `action:` / `logActivity(` across `backend/src` is authoritative; it also yields `user.created`, `course.updated`, `course.duplicated` and the `${role}.created` template (users.ts:200), none of which may break the typecheck. Let the typecheck drive the final union.
- E12: Record in CUTOVER_PROGRESS the contract notes: GET `/credits/balance/:studentId` `balance` string -> number; `lesson.created` -> `lesson.booked`; backend-only `slot.closed` / `request.withdrawn`; backend lesson-cancellation requests do not check that the lesson is `scheduled` at creation (local branch does), left as is.

### Dimension findings

- Infra fit: PASS — Postgres on 5432, `backend/.env` and `frontend/.env.local` present, 4000/4100 free; `buildApp({env})`, `tsx`, `hashPassword` available; only tsconfig include + lint script need editing and `backend/scripts/` is created by this plan.
- Test coverage: CONCERN (named residual R1, accepted as inherent repo constraint) — frontend local-branch changes (F2 local, F3, F4, F5) have no automated gate and rest on Agent-Probe browser checks; the extended FE-PARITY list is present and matches the code that changes. db-types test now asserts parser registration (verified it fails without `from`). Backend gates are Fully-Automated.
- Breaking changes: PASS — all contract changes are now listed and acknowledged: `lesson.created` -> `lesson.booked`; GET `/credits/balance/:studentId` string -> number; new 4xx (complete cancelled, foreign-lesson request, approve on completed); `RATE_LIMIT_MAX` Env literals updated in both test files; schema version bump in both constants. No frontend reader of renamed names or `.balance`.
- Security surface: PASS — no auth/secret code changes; request creation gains a lesson-ownership check (tightens); smoke guards (production, non-local host, random per-run admin password never logged, admin archived in finally) are sound; student self-purchase cap is existing behavior, asserted not fixed. Billing/credits high-risk class: evidence pack required before closure (RISK-PACK).
- Section WS-B feasibility: PASS — B1-B14 mechanically feasible against the live files; B1 snippet empirically correct; highest-risk edit B14 (refund logic): lesson status checked before the cancel update inside the txn, throw rolls back and keeps the request pending, `status = pending` predicate for double-approval.
- Section WS-F feasibility: PASS — F1-F7 feasible; no upload helper exists so F3 builds Blob/FormData; all 25/60 sites enumerated; highest-risk edit LESSON_CREDIT_HOURS + version bump, mitigated by the `25 / 60` / `LESSON_SLOT_MINUTES / 60` grep gate and the demo browser list.
- Section WS-S feasibility: PASS — routes for every scenario exist (`/review`, `/withdraw`, `/uploads`, `/credits`, `/settings`, `/activity` filters, absence); highest-risk edit is toggling global settings on a shared DB, mitigated by `finally` + SIGINT restore and printed originals.
- Section V feasibility: PASS — gates runnable; docs touchpoints complete including the stale `::int` lines; only observed pass counts may be recorded.

Open gaps: none new. Named residuals (all user-accepted, see Accepted by):
- R1 frontend local-branch parity on Agent-Probe only (no frontend test runner): known-gap: documented as NEW PLAN REQUIRED — see backlog/ (frontend test runner note, to be written in V5)
- booking/credit race (no row lock): known-gap: documented as NEW PLAN REQUIRED — see backlog/ (note to be written in V5)
- no unique constraint on lessons (teacher, date, time): known-gap: documented as NEW PLAN REQUIRED — see backlog/ (note to be written in V5)
- smoke not in CI, leave-behind fixtures, unlocked plan selection, student self-purchase cap, "credit hours" wording, rebook enrichment: known-gap: documented as NEW PLAN REQUIRED — see backlog/ (notes to be written in V5)

### What This Coverage Does NOT Prove

- SG-1 (typecheck/lint/vitest/diff-check): no behavior against Postgres; no frontend runtime behavior; vitest is DB-free and inject-only.
- Smoke scenarios (SPEC 1-3, 5-10, 12-15, 17, 19, 20): concurrent bookings by one student (race), duplicate lessons for the same teacher/time via POST /lessons, upload size/type limits, token refresh/expiry flows, behavior on a large production-like dataset, frontend rendering, demo-mode logic, any DB other than the local one.
- DB-TYPES vitest: that a real Postgres returns OID 1700 for `sum()`; that is proven only by the smoke typeof assertions.
- Hybrid browser rows (SPEC 11, 16, 18): single-browser, single-session agent checks; no cross-browser, mobile, or long-session coverage; the API-mode run depends on a restarted backend.
- FE-PARITY Agent-Probe: judgment-based, not repeatable in CI; covers only the listed demo scenarios; the F3 API-branch upload path is exercised only through the smoke attachment read-back, not through the browser UI.
- RISK-PACK: process evidence only, not a runtime guard.
- Whole contract: no frontend automated test; smoke is not in CI; the booking/credit race and missing unique constraint remain open by decision.

Gate: CONDITIONAL (0 FAILs; 0 unaccepted CONCERNs; 1 CONCERN, R1, accepted as an inherent repo constraint; named known-gap residuals recorded; 1 PVL fix cycle recorded in results.tsv)
Accepted by: user, via the dispatch brief for this VALIDATE run: "User-accepted known gaps: booking/credit race, no lessons unique constraint, unlocked plan selection, student self-purchase up to 100 credits, smoke not in CI, leave-behind fixtures. Frontend local-branch parity resting on Agent-Probe browser checks (no frontend test runner exists) is an inherent repo constraint." Accepted concerns by name: (1) frontend local-branch parity Agent-Probe only (R1); (2) booking/credit race; (3) no unique constraint on lessons; (4) unlocked plan selection; (5) student self-purchase cap; (6) smoke not in CI; (7) leave-behind fixtures.

## Autonomous Goal Block

SESSION GOAL: B3 domain smoke, parity fixes, 1-credit-per-lesson unit, numeric-hours crash fix (backend-cutover)
Charter + umbrella plan: N/A — single plan: process/features/backend-cutover/active/b3-domain-smoke_18-11-26/b3-domain-smoke_PLAN_18-11-26.md (SPEC in same folder)
Autonomy: proceed through WS-B, WS-F, WS-S, V without approval pauses; delegation to spawned agents stays mandatory (feedback_autonomous_phase_execution.md). One opus execute agent, EVL by a spawned vc-tester.
Hard stop conditions / safety constraints:
- Never run db:reset, db:push, truncate, drop table, or any destructive DB command, not even as a gate
- Smoke must refuse NODE_ENV=production and any non-local DATABASE_URL host (unless SMOKE_ALLOW_REMOTE), use port 4100, never write env files
- Never commit unless the user asks; commit directly on branch developing, never main
- Gate is CONDITIONAL (1 PVL fix cycle recorded + user-accepted residuals R1 and the 6 named known gaps); do not extend scope beyond the plan and E1-E12
- Do not hide or silence a failing smoke scenario; Known-Gap is never a proving strategy
Next phase: EXECUTE: process/features/backend-cutover/active/b3-domain-smoke_18-11-26/b3-domain-smoke_PLAN_18-11-26.md (after explicit ENTER EXECUTE MODE)
Validate contract: inline in plan (## Validate Contract)
Execute start: npm run typecheck | npm run lint | npm run test --workspace @lumina/backend | git diff --check | npm run smoke (twice + one deliberate red run) | agent browser checks demo + API mode | high-risk pack: yes (credits/booking, task folder harness/)

## Execution Status (EXECUTE 18-11-26)

Code complete; independent EVL rerun green (typecheck, lint, 16/16 tests, diff check, smoke x2 306 checks each). D-3 context edits applied in UPDATE PROCESS 18-11-26. Report: `b3-domain-smoke_REPORT_18-11-26.md` (same folder).

- WS-B: B1-B15 done (B15 gate green).
- WS-F: F1-F7 done (F7 gate green; `25 / 60` grep clean).
- WS-S: S1-S6 done (smoke 11/11 domains, 306 checks, twice; red run exit 1; grep gate empty).
- V: V1-V4 done; V5 done for `frontend/CUTOVER_PROGRESS.md` and the backlog notes; the `process/context/` edits (E7) were applied in UPDATE PROCESS (see D-3).

## Deviations

| ID | What deviated | Why | Impact |
|---|---|---|---|
| D-1 | Added backend `POST /assignments/:id/review` 400 on an already-reviewed assignment, plus the same guard in local `services/homework.ts` | Locked SPEC #17 and contract row SPEC-17 require "reviewing twice returns 400"; neither branch enforced it and no B-item covered it | New 400 on a public route (in the SPEC/contract); demo mirrors it |
| D-2 | Helper type in a new file `backend/src/lib/db-handle.ts` (`DbOrTx`), shared by activity/credits/lesson-defaults | E3 asks for the `PgDatabase<PostgresJsQueryResultHKT, typeof schema>` type in three helpers; one shared alias avoids repeating it | Naming/location only |
| D-3 | `process/context/` doc edits from V5/E7 (stale `::int` claims, RATE_LIMIT_MAX, smoke command, test count) NOT made during EXECUTE | The execute-agent definition forbids modifying `process/context/` (reserved for UPDATE PROCESS) | RESOLVED in UPDATE PROCESS 18-11-26: all-context.md, database/booking-and-credit-integrity.md, tests/all-tests.md, auth/demo-vs-api-mode.md, uxui/app-shell-and-roles.md, uxui/school-data-layer.md edited |
| D-4 | `courses.ts` activity action uses `course.${updated.status}` instead of `course.${body.status}` | The typed `ActivityAction` union rejected the possibly-undefined `body.status`; values are identical when the status changed | No behavior change |
| D-5 | `PeopleForms.tsx` hint "uses about 0.42 hours" changed to "uses 1 credit" | Unit change (F4) made the hint wrong; not listed in Touchpoints | Copy only |
| D-6 | FE-PARITY extended list proven by a Node probe that drives the real local-branch services on a memory store, plus Chromium book/cancel in demo mode, instead of clicking every flow in the UI | Deterministic and covers the services the UI calls; UI book/cancel still checked in the browser | Agent-Probe strength unchanged or better; still not a committed test (R1) |
| D-7 | Browser checks ran from a temporary copy of `frontend/` at `.b3-browser-fe/` (deleted afterwards) on :3100 with a backend on :4200 | A dev server already held `frontend/` (Next 16 allows one dev server per folder); env files untouched, env set in-process | None on the repo; temporary dir removed |

## Resume and Execution Handoff

1. Selected plan: `process/features/backend-cutover/active/b3-domain-smoke_18-11-26/b3-domain-smoke_PLAN_18-11-26.md`
2. Last completed step: PLAN written; working-tree edits to `bookings.ts` (lesson.booked) and `lessons.ts` (lesson.planChanged) already applied and kept.
3. Validate-contract status: re-written 18-11-26 (supersedes the first-pass contract), Gate: CONDITIONAL (Gap 1-9 resolved; residuals accepted by user).
4. Context files loaded: all-context.md, tests/all-tests.md, database/all-database.md, booking-and-credit-integrity.md, auth/all-auth.md, uxui/school-data-layer.md, plan-lifecycle.md, implementation-standards.md, the SPEC.
5. Next step: ENTER EXECUTE MODE; one opus vc-execute-agent runs WS-B, WS-F, WS-S, V in order. Never run db:reset/push/truncate. Smoke needs Postgres + backend env file. After EXECUTE, orchestrator spawns vc-tester for the EVL run.

Next Step: ENTER EXECUTE MODE (orchestrator emits the /goal block first).
