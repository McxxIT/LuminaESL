---
name: context:database-booking-and-credit-integrity
description: "Atomic booking (slot claim), credit ledger, refund rules, and known observed integrity risks"
keywords: booking, double-booking, slot, credit, ledger, refund, cancellation, transaction, race, balance, integrity
related: [context:all-database, context:all-uxui]
date: 18-11-26
---

# Booking and Credit Integrity

BLUF: Double-booking is prevented by deleting the `slot_openings` row inside a DB transaction (`DELETE ... RETURNING`) and, since migration `0004`, by a partial unique index on active lessons (`lessons_active_teacher_date_time_uidx`). Credits are an append-only ledger in `credit_entries`, and every refund now requires a `booking` debit for the same lesson and student. This is a user-flagged care area. Some risks below are still open — read each line's status, do not assume they are handled.

## Booking flow — `POST /bookings` (`backend/src/routes/bookings.ts`, transaction at ~L200)

1. Inside `app.db.transaction`: `lockStudentCredits(tx, studentId)` (`backend/src/lib/credits.ts`) takes a
   transaction-scoped advisory lock keyed on the student id. Every credit-mutating path takes this lock
   **first** (see "Ledger rules"), which is what makes the read-then-write below safe.
2. Load slot (404 if missing).
3. Balance check: `getCreditBalance(tx, studentId)` (numeric sum, no `::int` truncation); `< 1` -> 422 "Student does not have enough lesson credits".
4. Claim: `tx.delete(slotOpenings)...returning()` (~L215); no row -> `conflict("That slot was just taken")` (409).
5. Insert `lessons` row (25-minute: `addMinutes(time, LESSON_MINUTES)` from `lib/time.ts`), then a `credit_entries` row of -1 hour (`reason: booking`) plus an activity row (`logActivity`, action `lesson.booked`). Enrollment, next plan, and an `ESL-####` room code come from `resolveLessonDefaults` (`backend/src/lib/lesson-defaults.ts`), also used by `POST /lessons` for omitted fields.
6. The active-slot partial unique index is the final authority. If the teacher already has a `scheduled`/`live` lesson at that date/time, the insert raises `23505` on `lessons_active_teacher_date_time_uidx`; the handler maps it to `409 CONFLICT` and the slot claim, debit, and activity row roll back with it.

Managers may only book for students on their team (`managerOwnsStudent`, `backend/src/lib/scope.ts`).

## Active-slot collision guard (`lessons_active_teacher_date_time_uidx`)

- Migration `0004` (`backend/src/db/migrations/0004_gorgeous_maverick.sql`) adds a partial unique index on `lessons (teacher_id, date, time)` with predicate `status in ('scheduled','live')`.
- Cancelled and completed rows fall outside the predicate, so history may share the key; moving a lesson to `cancelled`/`completed` frees it for reuse, and reactivating into an occupied key is rejected.
- Every writer maps **only** that named constraint to `409 CONFLICT` via `isActiveLessonSlotConflict()` (`backend/src/lib/errors.ts`), which matches `constraint_name` with a `detail` fallback. Writers: `POST /lessons`, `PATCH /lessons/:id` (reschedule and status change), `POST /lessons/:id/rebook`, and `POST /bookings`. Every other `23505` keeps its existing handler.
- There is no app-level pre-check: the index is the concurrency authority, so two racing requests yield exactly one winner and one 409, with no orphan debit or slot claim.
- `PATCH /lessons/:id` runs the lesson update and both activity writes in one transaction so a collision cannot leave a half-applied reschedule.
- Conflict body: `{ "error": { "code": "CONFLICT", "message": "That teacher already has an active lesson at this date and time" } }`. Insufficient credit and validation errors stay distinct (`400 BAD_REQUEST` on `POST /lessons`, `422` on `POST /bookings`).
- Dev `lumina` is still **unmigrated** because it holds pre-existing duplicate active rows; all collision verification runs against the disposable `lumina_review` database (see `migrations-workflow.md`).

## Ledger rules

- Balance = sum of `credit_entries.hours` per student (`numeric(8,2)`; `routes/credits.ts` ~L113 sums as `::numeric`). Never update/delete entries; append adjustments.
- Reasons: purchase, booking (-1), refund (+), adjustment.
- **Refund gate (Nov 23, 2026):** `isLessonCharged(db, lessonId, studentId)` (`backend/src/lib/credits.ts`) is the only evidence a refund may use. It requires a `booking` debit row for that exact lesson **and** student whose per-lesson net is still negative, so an adjustment that reverses the charge, another lesson's debit, or another student's debit never mints a refund. Call it inside the refund transaction after `lockStudentCredits`.
- **Serialization (Nov 20, 2026):** `lockStudentCredits(tx, studentId)` wraps
  `pg_advisory_xact_lock(hashtextextended($1::text, 0))`. It is transaction-scoped (released on commit or
  rollback), needs no schema change, and serializes only that one student's ledger. All seven
  credit-mutating transactions call it first: `POST /bookings`, `POST /lessons`, `POST /lessons/:id/rebook`,
  `POST /lessons/:id/cancel`, `POST /lessons/:id/absence`, `POST /requests/:id/review` (cancellation only),
  and `POST /credits`. One lock, one order -> no credit-path deadlocks. `POST /requests/:id/review` reads
  the lesson's `studentId` *before* locking; `studentId` is immutable (`updateLessonSchema` cannot change it).
- Every credit path touches `credit_entries`, so any new credit mutation must take the same lock first.
  Known exception: the one-time `POST /school/import` writes historical ledger rows in bulk and does not take
  per-student locks (setup-time import, not a live booking path).
- `numeric` columns are parsed to JS numbers by the postgres type parser (`pgTypes`, OID 1700) in `backend/src/plugins/db.ts`; without it the API returned `"12.00"` strings and crashed the API-mode shell. `backend/tests/db-types.test.ts` covers it.
- Approve-cancel (`routes/requests.ts`) locks the lesson `FOR UPDATE`, requires the request to be pending
  (`UPDATE ... WHERE status = 'pending'`, 0 rows -> 409), refuses a completed lesson (409), and never refunds
  a lesson that is already cancelled.
- One credit per lesson: `LESSON_CREDIT_HOURS = 1` in the frontend local branch (`SCHOOL_SCHEMA_VERSION` 3).

## Refunds (`backend/src/routes/lessons.ts`, `backend/src/routes/requests.ts`)

- Student cancel (`/:id/cancel`, ~L800): the decision is made **inside** the transaction. The update is
  status-predicated (`WHERE id = $1 AND status = 'scheduled'`; 0 rows -> 409 "already been cancelled"), and
  the refund is inserted only when `isLessonCharged(tx, id, studentId)` is true and
  `hoursUntil(date,time) >= settings.studentLateCancellationHours` (default 24). Two concurrent cancels
  therefore refund once; the loser gets 409 (previously a timing-dependent double refund).
- Teacher absence (`/:id/absence`): `absences.lesson_id` is unique (migration `0003`), the duplicate check
  runs inside the transaction under the student lock, the lesson is cancelled only when it was not already
  cancelled, and the refund follows that real first transition **and** `isLessonCharged`. A unique
  violation also maps to 409.
- Manager-approved cancellation (`routes/requests.ts`): the lesson is locked `FOR UPDATE`, the request must
  be pending, a completed lesson is refused (409), and the refund is inserted only on the real transition
  to cancelled **and** `isLessonCharged` for that lesson and student.
- Frontend local-mode mirror uses `LESSON_CREDIT_HOURS` in `frontend/app/lib/school/services/common.ts`; keep rules identical in both branches.

## Known risks (observed)

1. Resolved in B3: the `::int` truncation is gone. Resolved Nov 20, 2026: `POST /lessons` debits 1
   credit (`credit_entries` `reason: "booking"`) and a cancellation refunds only a lesson that has
   that debit row; `resolveLessonDefaults` locks plan selection with `.for("update")`. Still open:
   student self-purchase (up to 100) has no payment check
   (`booking-rules-followups_NOTE_18-11-26.md`).
2. Resolved Nov 20, 2026: the balance read and debit are serialized per student by
   `lockStudentCredits` (advisory transaction lock); cancel and absence decisions moved inside the
   same transaction. Regression gate: `frontend/e2e/api/credit-concurrency.spec.ts` (three real races).
3. Resolved Nov 23, 2026: `lessons_active_teacher_date_time_uidx` (migration `0004`) is the unique guard
   on active `(teacherId, date, time)`, and every writer maps its violation to 409 (see "Active-slot
   collision guard"). Still open: dev `lumina` was deliberately not migrated because it holds 2 active
   duplicate groups (13 `scheduled` rows at `2026-11-29 06:00` and `2026-11-30 06:00`, residue from
   repeated `credit-concurrency.spec.ts` runs); the index is verified on the disposable `lumina_review`
   database. Migrating dev requires an approved cleanup decision.

Any fix needs a migration (see `migrations-workflow.md`) and a mirrored change in the frontend local branch.
