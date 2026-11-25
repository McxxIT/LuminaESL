---
phase: booking-collision-refund-policy
date: 2026-11-23
status: COMPLETE
feature: lessons-scheduling
plan: process/features/lessons-scheduling/completed/booking-collision-refund-policy_20-11-26/booking-collision-refund-policy_PLAN_20-11-26.md
---

# Booking Collision and Refund Policy — Closeout Report

## What Was Done

- **Partial unique index & migration (`138df6a`):** Added `lessons_active_teacher_date_time_uidx` on `lessons(teacher_id, date, time)` with predicate `status IN ('scheduled', 'live')` in `backend/src/db/schema.ts`, generated `backend/src/db/migrations/0004_gorgeous_maverick.sql` (with `_journal.json` and `0004_snapshot.json`), and applied it to the disposable `lumina_review` database after exporting the read-only duplicate inventory of dev `lumina` (`booking-collision-refund-policy_INVENTORY_21-11-26.md`).
- **Named-constraint collision enforcement (`7769900`):** Added `isActiveLessonSlotConflict()` in `backend/src/lib/errors.ts` and mapped only that named index's PostgreSQL `23505` violation to `409 CONFLICT` across `POST /lessons`, `PATCH /lessons/:id` (now wrapping the update and both activity writes in a single transaction), `POST /lessons/:id/rebook`, and `POST /bookings`.
- **Booking-debit refund gate (`7769900`):** Added `isLessonCharged(db, lessonId, studentId)` in `backend/src/lib/credits.ts` requiring both a matching `booking` debit row for that exact lesson and student and a net-negative per-lesson ledger balance; enforced it across student cancel, teacher absence, and manager-approved cancellation (`backend/src/routes/lessons.ts`, `backend/src/routes/requests.ts`).
- **Regression & concurrency coverage (`7769900`, `29093ac`):** Added `frontend/e2e/api/booking-collision.spec.ts` (5 tests), added the `refunds` scenario to `backend/scripts/smoke.ts` (22 checks), made `booking.spec.ts` and `credit-concurrency.spec.ts` cleanup collision-aware, and aligned the Playwright backend `RATE_LIMIT_MAX=100000` with `smoke.ts`.
- **Context & backlog reconciliation (UPDATE PROCESS):** Archived the task folder to `process/features/lessons-scheduling/completed/booking-collision-refund-policy_20-11-26/`, updated `process/context/{all-context.md,database/booking-and-credit-integrity.md,database/migrations-workflow.md,database/schema-and-models.md,tests/all-tests.md}`, and reconciled `process/features/backend-cutover/backlog/booking-credit-concurrency_NOTE_18-11-26.md`.

## What Was Skipped/Deferred

- **Migrating dev `lumina`:** Intentionally not migrated because it holds 2 active duplicate groups (13 `scheduled` test-residue rows from prior `credit-concurrency.spec.ts` runs); tracked in `process/features/backend-cutover/backlog/booking-credit-concurrency_NOTE_18-11-26.md`.
- **CI migration / e2e wiring & production migration rehearsal:** Repo has no CI provider or production environment yet; tracked in `process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md` and `smoke-ci-and-fixtures_NOTE_18-11-26.md`.
- **Rebook semantic expansion & student self-purchase payment gate:** Explicitly out of scope; remain tracked in `rebook-enrichment_NOTE_18-11-26.md` and `booking-rules-followups_NOTE_18-11-26.md`.

## Test Gate Outcomes

All DB-backed gates ran against the disposable `lumina_review` database (`DATABASE_URL` overridden per command); detailed logs live in `booking-collision-refund-policy_EXECUTE_23-11-26.md` §2.

| Gate | Command | Outcome |
|---|---|---|
| Typecheck | `npm run typecheck` | Green (both workspaces) |
| Lint | `npm run lint` | Green (both workspaces) |
| Backend unit/contract | `npm run test --workspace @lumina/backend` | Green (5 files / 30 tests) |
| Smoke | `npm run smoke` | Green (14/14 domains, 375 checks, +22 `refunds`) |
| API E2E (repeat proof) | `npm run e2e:api --workspace @lumina/frontend` | Green (23/23 run 1, 23/23 run 2) |
| Demo E2E | `npm run e2e:demo --workspace @lumina/frontend` | Green (3/3) |
| Migration & index check | `npm run db:migrate` + `pg_indexes` on `lumina_review` | Green (5 migrations, partial unique index present, 0 active duplicate groups) |

## Plan Deviations

1. **`POST /bookings` absorbed into RFC-002:** Added the same named-index `409 CONFLICT` mapping because student booking inserts into `lessons` and would otherwise have returned an unhandled `23505` (500) on an occupied key.
2. **E2E backend rate limit raised (`RATE_LIMIT_MAX=100000`):** Added to `frontend/playwright.config.ts` (matching `smoke.ts`) because the expanded 23-test suite hit the 300/min default on `/health`. Production/`.env` behavior is unchanged.
3. **Insufficient-credit status on `POST /lessons` kept at `400 BAD_REQUEST`:** Preserved existing behavior (`POST /bookings` keeps `422`); the SPEC only required collision (`409 CONFLICT`) to remain distinguishable.
4. **`isLessonCharged` requires net-negative lesson balance:** Satisfies both BC-4 (`booking` row existence) and AC12 (adjusted-away debits must not mint refunds).
5. **Collision-aware cleanup in two existing specs:** Updated `booking.spec.ts` and `credit-concurrency.spec.ts` so repeat runs do not self-collide on fixed keys.

## Test Infra Gaps Found

- Shared dev `lumina` cannot run migration `0004` or the collision suite until its 13 duplicate test-residue rows receive an approved cleanup decision; until then, `DATABASE_URL` must point to disposable `lumina_review`.
- No CI job runs `db:migrate`, `npm run smoke`, or `npm run e2e` against a throwaway Postgres service (`e2e-ci-wiring_NOTE_18-11-26.md`).

## SPEC Achievement

Scored against locked `booking-collision-refund-policy_SPEC_20-11-26.md`:

| AC | Strategy | Status | Evidence |
|---|---|---|---|
| AC1 | Hybrid | **met** | `booking-collision.spec.ts` tests 1–4 |
| AC2 | Fully-Automated | **met** | `booking-collision.spec.ts` test 5 (`409` vs `400 VALIDATION_ERROR` vs `400 BAD_REQUEST`) |
| AC3 | Hybrid | **met** | `booking-collision.spec.ts` test 4 (concurrent `POST /lessons`, 1 winner + 1 `409`, 1 active row) |
| AC4 | Hybrid | **met** | `INVENTORY_21-11-26.md` §9.3 + `booking-collision.spec.ts` reactivation/reuse test |
| AC5 | Agent-Probe | **met (as designed)** | `INVENTORY_21-11-26.md` §9.4 (dev DB untouched; `lumina_review` history preserved) |
| AC6 | Agent-Probe | **met (as designed)** | `INVENTORY_21-11-26.md` §6/§9.4 (no auto-cleanup; dev DB untouched) |
| AC7 | Hybrid | **met** | `npm run smoke` `refunds` checks 1–3 |
| AC8 | Hybrid | **met** | `npm run smoke` `refunds` check 4 |
| AC9 | Fully-Automated | **met** | `credit-concurrency.spec.ts` race tests + `cancellation-refund.spec.ts` |
| AC10 | Hybrid | **met** | `npm run smoke` `refunds` checks 1, 4, 5 |
| AC11 | Fully-Automated | **met** | `booking-collision.spec.ts` test 5 |
| AC12 | Hybrid | **met** | `npm run smoke` `refunds` check 2 (booking `-1` + adjustment `+1` tied to lesson) |

## SPEC Gaps

None for the locked SPEC scope. Applying migration `0004` to dev `lumina` and adding CI/production rehearsal are tracked outside this SPEC in `process/features/backend-cutover/backlog/booking-credit-concurrency_NOTE_18-11-26.md` and `e2e-ci-wiring_NOTE_18-11-26.md`.

## Closeout Packet

1. **Selected plan path:** `process/features/lessons-scheduling/completed/booking-collision-refund-policy_20-11-26/booking-collision-refund-policy_PLAN_20-11-26.md`
2. **Closeout classification:** `Ready for UPDATE PROCESS archival`
3. **What was finished:** Partial unique index + migration `0004` on `lumina_review`, strict `409 CONFLICT` collision handling across all 4 lesson writers, `isLessonCharged` refund gate across all 3 refund paths, 5 new collision e2e tests + 22 new smoke refund checks, and full context/backlog reconciliation.
4. **Verified vs. unverified:** All planned static, unit, smoke (14/14, 375), API e2e (23/23 ×2), and demo e2e (3/3) gates passed on `lumina_review`. Unverified/deferred: dev `lumina` migration (needs approved cleanup), CI wiring, production-scale concurrency/rehearsal.
4b. **Validate-contract compliance:** Present inline in plan (`Status: CONDITIONAL`, 20-11-26, accepted); E1–E8 satisfied.
5. **Cleanup done vs. still needed:** Task folder archived to `completed/`, 5 context docs updated, backlog note reconciled, closeout report written, Tier-1 validators run, process-only commit made.
6. **Single best next valid state:** Start a new RESEARCH session on the next chosen follow-up (dev `lumina` duplicate-cleanup decision, attachment download scoping, student credit self-purchase gate, or Curriculum Library).
7. **Commit-checkpoint recommendation:** Process commit after UPDATE PROCESS (source commits `138df6a`..`650cb66` already landed separately).
8. **Regression status:** Single complex plan; full Vitest, smoke, API e2e, and demo e2e green with no regressions.
9. **SPEC achievement:** AC1–AC4 and AC7–AC12 met by automated/hybrid gates; AC5–AC6 met as designed Agent-Probe.

Drift score: HIGH (5/6 signals). Strongly recommend UPDATE PROCESS -- harness/protocol files touched.

## Forward Preview

### Test Infra Found
- `lumina_review` serves as the disposable local Postgres target for migration `0004` and collision/e2e runs while dev `lumina` remains unmigrated.
- `frontend/playwright.config.ts` sets `RATE_LIMIT_MAX=100000` on the e2e backend webServer.
- `frontend/e2e/support/api.ts` now exposes `apiCall`, `openSlot`, `slotsFor`, and `ApiSlot`.

### Blast Radius Changes
- Added `backend/src/routes/bookings.ts` (`POST /bookings` collision guard), `frontend/playwright.config.ts` (rate-limit env), and collision-aware cleanup in `frontend/e2e/api/{booking,credit-concurrency}.spec.ts` relative to the initial plan blast radius.

### Commands to Stay Green
```powershell
$env:DATABASE_URL='postgres://lumina:<pw>@localhost:5432/lumina_review'
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e:api --workspace @lumina/frontend
npm run e2e:demo --workspace @lumina/frontend
git diff --check
```

### Dependency Changes
- None.
