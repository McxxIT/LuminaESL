---
name: context:database-booking-and-credit-integrity
description: "Atomic booking (slot claim), credit ledger, refund rules, and known observed integrity risks"
keywords: booking, double-booking, slot, credit, ledger, refund, cancellation, transaction, race, balance, integrity
related: [context:all-database, context:all-uxui]
date: 18-11-26
---

# Booking and Credit Integrity

BLUF: Double-booking is prevented by deleting the `slot_openings` row inside a DB transaction (`DELETE ... RETURNING`); credits are an append-only ledger in `credit_entries`. This is a user-flagged care area. Risks below are observed but NOT fixed — do not assume they are handled.

## Booking flow — `POST /bookings` (`backend/src/routes/bookings.ts`, transaction at ~L175)

1. Inside `app.db.transaction`: load slot (404 if missing).
2. Balance check: `getCreditBalance(tx, studentId)` (`backend/src/lib/credits.ts`, numeric sum, no `::int` truncation); `< 1` -> 422 "Student does not have enough lesson credits".
3. Claim: `tx.delete(slotOpenings)...returning()` (~L190-198); no row -> `conflict("That slot was just taken")` (409).
4. Insert `lessons` row (25-minute: `addMinutes(time, LESSON_MINUTES)` from `lib/time.ts`), then a `credit_entries` row of -1 hour (`reason: booking`) plus an activity row (`logActivity`, action `lesson.booked`). Enrollment, next plan, and an `ESL-####` room code come from `resolveLessonDefaults` (`backend/src/lib/lesson-defaults.ts`), also used by `POST /lessons` for omitted fields.

Managers may only book for students on their team (`managerOwnsStudent`, `backend/src/lib/scope.ts`).

## Ledger rules

- Balance = sum of `credit_entries.hours` per student (`numeric(8,2)`; `routes/credits.ts` ~L113 sums as `::numeric`). Never update/delete entries; append adjustments.
- Reasons: purchase, booking (-1), refund (+), adjustment.
- `numeric` columns are parsed to JS numbers by the postgres type parser (`pgTypes`, OID 1700) in `backend/src/plugins/db.ts`; without it the API returned `"12.00"` strings and crashed the API-mode shell. `backend/tests/db-types.test.ts` covers it.
- Approve-cancel (`routes/requests.ts`) locks the lesson `FOR UPDATE`, requires the request to be pending, refuses a completed lesson (409), and never refunds a lesson that is already cancelled.
- One credit per lesson: `LESSON_CREDIT_HOURS = 1` in the frontend local branch (`SCHOOL_SCHEMA_VERSION` 3).

## Refunds (`backend/src/routes/lessons.ts`)

- Student cancel (~L638): refunded when `hoursUntil(date,time) >= settings.studentLateCancellationHours` (default 24); otherwise "Late cancellation, no refund". Refund row at ~L651.
- Teacher absence (~L720-752): refunds when `settings.refundTeacherCancellations` (default true) and the lesson is not already cancelled.
- Frontend local-mode mirror uses `LESSON_CREDIT_HOURS` in `frontend/app/lib/school/services/common.ts`; keep rules identical in both branches.

## Known risks (observed, not fixed)

1. (Resolved in B3: the `::int` truncation is gone.) Backend `POST /lessons` does not debit a credit while demo add-lesson debits 1; an early student cancel refunds +1, so credits can be minted (`booking-rules-followups_NOTE_18-11-26.md`). Plan selection is also unlocked, and student self-purchase (up to 100) has no payment check.
2. The balance read and the debit are not row-locked: two concurrent bookings by one student could both pass the balance check.
3. No unique constraint on `lessons (teacherId, date, time)`; only `slot_openings` unique index protects slots, so teacher-created lessons (`createLesson` path) rely on app checks.

Any fix needs a migration (see `migrations-workflow.md`) and a mirrored change in the frontend local branch.
