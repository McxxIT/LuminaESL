---
name: report:credit-ledger-serialization-execute
description: "EXECUTE report: per-student advisory lock for credit mutations, transaction-scoped refund decisions, unique absences.lesson_id"
date: 20-11-26
feature: people-billing
---

# Credit Ledger Serialization — EXECUTE Report

**Plan**: `credit-ledger-serialization_PLAN_20-11-26.md` (same folder)
**Date**: 20-11-26
**Status**: COMPLETE — all checklist phases green, gates run, docs updated.
**Complexity**: MEDIUM (backend only + one API-mode spec)

## 1. What was wrong

`getCreditBalance()` and the matching insert ran in one transaction but nothing serialized them. With one
credit, two concurrent `POST /bookings` calls could both read `1`, both debit, and leave the ledger at `-1`.
Cancellation and absence were worse: `debited` / `refunded` / "already recorded" were decided **outside** the
transaction, and the lesson update had no status predicate, so two concurrent requests could each refund.

## 2. What changed

| File | Change |
|---|---|
| `backend/src/lib/credits.ts` | New `lockStudentCredits(db, studentId)` — `pg_advisory_xact_lock(hashtextextended($1::text, 0))`, transaction-scoped, one key per student. Doc-comment states it must be the first statement in a credit transaction. |
| `backend/src/routes/bookings.ts` | Booking transaction takes the student lock before reading the slot. |
| `backend/src/routes/lessons.ts` | Create, rebook, cancel, and absence take the lock first. Cancel now updates `WHERE id AND status = 'scheduled'` (0 rows -> 409) and re-reads the `booking` debit inside the lock before refunding. Absence re-checks duplicates and derives the refund from the lesson's own `scheduled -> cancelled` transition. |
| `backend/src/routes/requests.ts` | Cancellation approval reads the lesson's immutable `studentId` first, then locks, then updates the status-predicated request and `FOR UPDATE` lesson. Same order as cancel. |
| `backend/src/routes/credits.ts` | `POST /credits` takes the lock before its insert. |
| `backend/src/lib/errors.ts` | `isUniqueViolation()` helper (SQLSTATE 23505) so the absence insert can map a duplicate to 409 even if the pre-check is bypassed. |
| `backend/src/db/schema.ts` | `absences.lessonId ... .unique()`. |
| `backend/src/db/migrations/0003_supreme_victor_mancha.sql` | `ALTER TABLE "absences" ADD CONSTRAINT "absences_lesson_id_unique" UNIQUE("lesson_id")` (applied). |
| `frontend/e2e/api/credit-concurrency.spec.ts` | New API-only spec with three real races. |
| `frontend/e2e/support/api.ts` | New `setCreditBalance(token, studentId, target)` — writes one `adjustment` entry to move a ledger to a known value and returns the previous balance. `lessonAt()` now returns the **newest** matching lesson (`createdAt` desc) instead of the first one: repeat runs leave cancelled lessons at the same student/date/time, so the old lookup asserted on a stale row and `booking.spec.ts` failed with `cancelled` instead of `scheduled`. |
| `frontend/e2e/api/booking.spec.ts` | Restores the credit it spends in `finally`. The suite had been draining the seeded student by 1 credit per full run and eventually starved `cancellation-refund` (proved: `Mia Chen has 0.25 credit hours`). |

No API route, payload shape, status code for the non-racing path, dependency, or frontend code changed.
The one intentional contract change: cancelling a lesson that is already cancelled now returns **409**
instead of the timing-dependent 400/409 split (the pre-check was removed so the transaction is the only
decision point).

## 3. Decisions as implemented

- **CL-1/CL-2** — Advisory lock per student, acquired first in all seven credit-mutating transactions. No
  schema change needed for the lock itself; `hashtextextended` collisions only over-serialize.
- **CL-3** — Cancel/absence decisions moved inside the transaction; the status predicate is what makes the
  loser fail deterministically.
- **CL-4** — Refund derives its own evidence: the `booking` debit row is re-read under the lock, and the
  timing rule uses `hoursUntil(row.date, row.time)` from the updated row.
- **CL-5** — Unique `absences.lesson_id` + migration `0003`; 0 duplicate absences existed, so it applied
  cleanly.
- **CL-6** — Approval reads `studentId` (immutable; `updateLessonSchema` cannot change it) before locking.
- **CL-7** — Race proof is three Playwright tests, asserting ledger state, not timing.

## 4. Verification evidence

| Gate | Command | Result |
|---|---|---|
| Static | `npm run typecheck`, `npm run lint` | pass (both workspaces) |
| Migration | `npm run db:migrate` (backend) | `0003` applied; `absences_lesson_id_unique` confirmed via `pg_constraint` |
| Backend unit/contract | `npm run test --workspace @lumina/backend` | 5 files, 30/30 pass |
| Domain smoke | `npm run smoke` | 13/13 domains, 353 checks, settings restored |
| Race suite | `npx playwright test --config playwright.config.ts api/credit-concurrency.spec.ts` | 3/3 pass |
| Negative probe | Same test with the booking lock commented out | **failed** (both bookings 201) — proves the spec gates the fix |
| Full parity ×2 | `npm run e2e` twice back to back | see §4.1 |
| Safety | `git diff --check`, `git status` | clean; no `db:reset`/`push`/`truncate`, no `.env*` edits |

### 4.1 Full parity runs

- Run 1: `npm run e2e` — 18 API passed (2.0m) + 3 demo passed (12.7s); exit 0.
- Run 2: `npm run e2e` — 18 API passed (56.9s) + 3 demo passed (11.7s); exit 0.

Both runs were executed back to back on 21-11-26 after the `lessonAt` fix described in §5. No test was
flaky, skipped, or retried.

## 5. Residue and dev-DB maintenance

- **Discovered during P5.3**: the full parity run failed the second time with
  `Mia Chen has 0.25 credit hours (not enough for a lesson; add credits first)`. Root cause is pre-existing:
  `booking.spec.ts` spends one credit per run and never returned it, so the seeded student drained 1 credit
  per full suite run. `cancellation-refund` needs ≥ 1 credit to start.
- **Fix**: `booking.spec.ts` now restores the balance with `setCreditBalance` in `finally` (assertion still
  `-1`), and `credit-concurrency.spec.ts` uses the same helper.
- **One-time dev-DB top-up**: `student@lumina.school` was adjusted from 0.25 back to 24 credits through
  `POST /credits` (reason `adjustment`, description "restore seeded student balance for repeatable e2e runs").
  No reset, push, truncate, or seed was run.
- Probe lessons: three per run (two future dates from the booking race, one past date from the absence race).
  They are normal `scheduled`/`cancelled` lessons and are not removable through the API.
- The losing booking's open slot is closed in `finally`; the winning slot is consumed by the booking.
- Earlier failed/probe runs left extra lessons on the same dates; the spec diffs lesson ids instead of
  counting, so repeat runs stay deterministic.
- **Second P5.3 blocker (21-11-26)**: the first full run failed `booking.spec.ts` with
  `expected "scheduled", received "cancelled"`. `lessonAt()` returned the *first* lesson matching
  student/date/time, and six cancelled lessons from earlier runs already sat at `2026-11-25 23:30`.
  `cancellation-refund.spec.ts` was passing only because it expects `cancelled`. Fixed in
  `e2e/support/api.ts`: `ApiLesson` gained `createdAt` and `lessonAt()` returns the newest match, so each run
  asserts on the lesson it just created. Two clean full runs followed (18 API + 3 demo each).
- **Residue is still growing**: the three 21-11-26 parity runs added three more `scheduled` lessons to
  `2026-11-30 06:00` (2 -> 5) because `credit-concurrency.spec.ts` always books `isoDaysFromNow(9)` at
  `06:00`. With the planned partial unique index this spec would 409 on its second run of the day. Recorded
  in `lessons-scheduling/active/booking-collision-refund-policy_20-11-26/booking-collision-refund-policy_INVENTORY_21-11-26.md`
  §8; the fix belongs to that plan's RFC-004.

## 6. What stays open

1. Unique `lessons (teacher_id, date, time)` — blocked by 2 active duplicate groups (13 `scheduled` rows at
   `2026-11-29 06:00` and `2026-11-30 06:00`), all residue from this spec. Needs a disposable DB or a
   reviewed cleanup migration. Tracked by `lessons-scheduling/active/booking-collision-refund-policy_20-11-26/`.
2. Student self-purchase without a payment gate (product decision).
3. `POST /lessons/:id/rebook` charges again without cancelling the original lesson — pre-existing behavior,
   still a product question.
4. `POST /school/import` writes historical ledger rows in bulk without per-student locks (setup-time path,
   documented in `database/booking-and-credit-integrity.md`).

## 7. Next step

UPDATE PROCESS: archive this plan/report into
`process/features/people-billing/completed/credit-ledger-serialization_20-11-26/` and keep the two open
items in the backlog notes. Commit checkpoint: backend lock + migration + spec (one logical commit), docs +
plan archive (second commit).
