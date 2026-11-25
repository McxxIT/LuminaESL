---
name: report:booking-collision-refund-policy-execute
description: "RFC-002/003/004 execution evidence: collision enforcement, refund debit evidence, and the full verification gate run"
date: 23-11-26
feature: lessons-scheduling
plan: booking-collision-refund-policy_PLAN_20-11-26.md
status: COMPLETE
---

# Booking Collision and Refund Policy - Execute Report

**Date**: 23-11-26
**Plan**: `booking-collision-refund-policy_PLAN_20-11-26.md`
**RFCs covered**: RFC-001 (steps 4-6), RFC-002, RFC-003, RFC-004
**Result**: ✅ all four RFCs complete; every planned gate green

## 1. What changed

### Schema and migration (RFC-001)

| File | Change |
|---|---|
| `backend/src/db/schema.ts` | Partial unique index `lessons_active_teacher_date_time_uidx` on `(teacher_id, date, time)` where `status in ('scheduled','live')` |
| `backend/src/db/migrations/0004_gorgeous_maverick.sql` | Generated `CREATE UNIQUE INDEX ... WHERE "lessons"."status" in ('scheduled', 'live')` |
| `backend/src/db/migrations/meta/_journal.json` | `idx: 4` entry appended by `db:generate` |
| `backend/src/db/migrations/meta/0004_snapshot.json` | Generated snapshot |

Applied to the disposable `lumina_review` database only. Dev `lumina` was not migrated and keeps its 13
duplicate rows (inventory §9).

### Collision enforcement (RFC-002)

| File | Change |
|---|---|
| `backend/src/lib/errors.ts` | `ACTIVE_LESSON_SLOT_CONSTRAINT`, `ACTIVE_LESSON_CONFLICT_MESSAGE`, `isActiveLessonSlotConflict()` — matches the constraint name (plus `detail` fallback), never the bare SQLSTATE |
| `backend/src/routes/lessons.ts` | `POST /lessons`, `PATCH /lessons/:id`, `POST /lessons/:id/rebook` wrap their writes in the existing transaction and map only the named-index `23505` to `409 CONFLICT`. `PATCH` now runs the lesson update and both activity writes in one transaction |
| `backend/src/routes/bookings.ts` | `POST /bookings` (student booking) maps the same violation to the same `409` — **scope absorption, see §5** |

### Refund debit evidence (RFC-003)

| File | Change |
|---|---|
| `backend/src/lib/credits.ts` | `isLessonCharged(db, lessonId, studentId)`: a `booking` debit row must exist for that exact lesson **and** student, and the lesson's ledger net must still be negative (so an adjusted-away charge is not evidence) |
| `backend/src/routes/lessons.ts` | Student cancel now uses `isLessonCharged` (previously matched `lesson_id` but ignored `student_id`); teacher absence now requires a real first transition **and** `isLessonCharged` before refunding |
| `backend/src/routes/requests.ts` | Manager approval refunds only when `isLessonCharged` is true for the cancelled lesson and student |

### Tests and harness (RFC-004)

| File | Change |
|---|---|
| `frontend/e2e/api/booking-collision.spec.ts` | **New**, 5 tests: occupied-slot booking, reschedule collision, reactivation collision, concurrent creates, collision-vs-validation-vs-credit |
| `frontend/e2e/support/api.ts` | Added `apiCall` (non-throwing status reader), `openSlot`, `slotsFor`, `ApiSlot` |
| `backend/scripts/smoke.ts` | New `refunds` scenario (22 checks): uncharged, reversed, charged control, uncharged absence, uncharged approval |
| `frontend/e2e/api/booking.spec.ts` | Cancels the lesson it booked in `finally`, so the key is free on rerun |
| `frontend/e2e/api/credit-concurrency.spec.ts` | `freeTime()` also skips keys with an active lesson (a closed slot is no longer sufficient); booking-race cleanup cancels its leftover lesson |
| `frontend/playwright.config.ts` | Backend webServer runs with `RATE_LIMIT_MAX=100000`, matching `smoke.ts` |

## 2. Gate results

Run against `lumina_review` (`DATABASE_URL` overridden per command).

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ clean (both workspaces) |
| Lint | `npm run lint` | ✅ clean (both workspaces) |
| Backend unit/contract | `npm run test --workspace @lumina/backend` | ✅ 5 files / 30 tests |
| Smoke | `npm run smoke` | ✅ 14/14 domains, **375 checks** (was 353; +22 refunds) |
| API e2e | `npm run e2e:api --workspace @lumina/frontend` | ✅ 23/23 (run 1), ✅ 23/23 (run 2, repeat-run proof) |
| Demo e2e | `npm run e2e:demo --workspace @lumina/frontend` | ✅ 3/3 |
| Collision spec alone | `-- booking-collision.spec.ts` | ✅ 5/5 |
| Migration apply | `db:migrate` on `lumina_review` | ✅ 5 migrations, index present |
| DB duplicate inventory | `group by teacher_id,date,time having count(*) > 1` | ✅ 0 active groups after both e2e runs |

## 3. Acceptance criteria

| AC | Evidence | Status |
|---|---|---|
| AC1 — create/active change at an occupied key → 409, no lesson/slot/debit/activity change | collision spec tests 1-3 + concurrent test | ✅ |
| AC2 — deterministic 409; insufficient credit and validation stay distinct | collision spec test 5 (`CONFLICT` 409 vs `VALIDATION_ERROR` 400 vs `BAD_REQUEST` 400) | ✅ |
| AC3 — concurrent attempts → one winner, one conflict, no extra debit/slot | collision spec test 4; DB shows 1 active row | ✅ |
| AC4 — cancelled/completed history does not block reuse | collision probe (INVENTORY §9.3); reactivation test cancels and reuses the key | ✅ |
| AC5 — cancelled/completed groups unchanged | INVENTORY §9.4 (dev DB untouched); review DB history rows preserved | ✅ |
| AC6 — existing active duplicates not auto-cleaned | INVENTORY §6/§9.4 | ✅ |
| AC7 — student cancel refunds only a matching booking debit | smoke `refunds` checks 1-3 | ✅ |
| AC8 — teacher absence refunds only a matching debit on a real first transition | smoke `refunds` check 4 | ✅ |
| AC9 — repeat cancel/absence/approval adds no second refund | existing `credit-concurrency` race tests still pass | ✅ |
| AC10 — no-debit cancellation/absence emits no refund | smoke `refunds` checks 1, 4, 5 | ✅ |
| AC11 — collision distinguishable from insufficient credit | collision spec test 5 | ✅ |
| AC12 — adjusted-away/unrelated entries do not mint refunds | smoke `refunds` check 2 (booking -1 + adjustment +1 tied to the lesson) | ✅ |

## 4. Evidence highlights

- Collision 409 body: `{ "error": { "code": "CONFLICT", "message": "That teacher already has an active lesson at this date and time" } }`.
- Rollback proof: after the losing request, the slot is still open, the balance is unchanged, and exactly
  one active lesson exists at the key.
- The named-index guard is narrow: the absence duplicate path still returns its own 409 message, and
  slot/rating unique violations keep their existing handlers (smoke `slots`, `lessons`, `quality` domains).
- Repeat-run proof: two consecutive full API runs leave **0** active duplicate groups.

## 5. Deviations and scope notes

1. **`POST /bookings` absorbed into RFC-002.** The plan listed `bookings.ts` as read-only. The student
   booking path inserts a lesson and would have returned an unhandled `23505` (500) for an occupied key —
   reachable whenever a teacher opens a slot at a time that already has an active lesson. Mapping it to
   the same 409 is an additive guard under the already-approved collision contract (no new policy, no
   payload change), so it was absorbed per Change Management ("Additive test/guard"). It is now a
   first-class touchpoint.
2. **Rate limit raised for the e2e backend.** The default `RATE_LIMIT_MAX=300/min` rejected later specs
   with `429` on `/health` once the suite grew. `smoke.ts` already sets `100000`; the Playwright backend
   webServer now does the same. Production/`.env` behavior is unchanged.
3. **Plan says 422 for insufficient credit on `POST /lessons`; the code returns 400 `BAD_REQUEST`.**
   Existing behavior was preserved (the SPEC only requires the outcome to be *distinguishable*). The
   test asserts the real code and the discrepancy is recorded here rather than silently changing the
   public contract. `POST /bookings` does use `422 UNPROCESSABLE_ENTITY` for the same condition.
4. **`isLessonCharged` also requires a net-negative lesson balance.** The plan's BC-4 describes evidence
   as the existence of a `booking` row, while AC12 requires an adjusted-away debit not to refund. Both
   are satisfied: the `booking` row must exist *and* the lesson's ledger must still be negative.
5. **Two existing specs needed collision-aware cleanup** (booking, credit-concurrency). They previously
   accumulated one scheduled lesson per run at a fixed key, which the new index now rejects. This is the
   exact self-collision the inventory §8 predicted; the fix belongs to RFC-004 as planned.

## 6. Known gaps

- Dev database `lumina` remains unmigrated by design; running `npm run e2e` without a `DATABASE_URL`
  override will hit the dev residue. Use `lumina_review` (see the plan's handoff) or approve a dev cleanup.
- Production-scale concurrency and production migration rehearsal remain unproven (no CI, no prod access).
- AC5/AC6 stay agent-probe evidence: they prove the dev DB was not modified, not that a future cleanup is safe.
- The collision spec's `activeLessonsAt` counts only active rows on purpose; cancelled history is expected
  to accumulate in the review DB.

## 7. Residue

- `lumina_review`: 2 seeded lessons plus test history (scheduled 8 / completed 6 / cancelled 57 at last
  check), 0 active duplicate groups. Disposable by design.
- Dev `lumina`: unchanged by this work (207 scheduled / 68 completed / 189 cancelled, 13 duplicate rows).
- Smoke fixtures are left behind by design (existing convention); they are named `smoke-{runId}-*` and
  `Smoke refund probe {runId}`.
