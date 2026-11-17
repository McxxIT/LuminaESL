---
name: context:database-booking-and-credit-integrity
description: "Atomic booking (slot claim), credit ledger, refund rules, and known observed integrity risks"
keywords: booking, double-booking, slot, credit, ledger, refund, cancellation, transaction, race, balance, integrity
related: [context:all-database, context:all-uxui]
date: 17-11-26
---

# Booking and Credit Integrity

BLUF: Double-booking is prevented by deleting the `slot_openings` row inside a DB transaction (`DELETE ... RETURNING`); credits are an append-only ledger in `credit_entries`. This is a user-flagged care area. Three risks are observed but NOT fixed — do not assume they are handled.

## Booking flow — `POST /bookings` (`backend/src/routes/bookings.ts`, transaction at ~L175)

1. Inside `app.db.transaction`: load slot (404 if missing).
2. Balance check: `coalesce(sum(hours),0)::int` for the student (~L185); `< 1` -> 422 "Student does not have enough lesson credits".
3. Claim: `tx.delete(slotOpenings)...returning()` (~L190-198); no row -> `conflict("That slot was just taken")` (409).
4. Insert `lessons` row (25-minute: `addMinutes(time, LESSON_MINUTES)` from `lib/time.ts`), then a `credit_entries` row of -1 hour (`reason: booking`) plus an activity row.

Managers may only book for students on their team (`managerOwnsStudent`, `backend/src/lib/scope.ts`).

## Ledger rules

- Balance = sum of `credit_entries.hours` per student (`numeric(8,2)`; `routes/credits.ts` ~L113 sums as `::numeric`). Never update/delete entries; append adjustments.
- Reasons: purchase, booking (-1), refund (+), adjustment.

## Refunds (`backend/src/routes/lessons.ts`)

- Student cancel (~L638): refunded when `hoursUntil(date,time) >= settings.studentLateCancellationHours` (default 24); otherwise "Late cancellation, no refund". Refund row at ~L651.
- Teacher absence (~L720-752): refunds when `settings.refundTeacherCancellations` (default true) and the lesson is not already cancelled.
- Frontend local-mode mirror uses `LESSON_CREDIT_HOURS` in `frontend/app/lib/school/services/common.ts`; keep rules identical in both branches.

## Known risks (observed, not fixed)

1. `sum(...)::int` in `bookings.ts` ~L185 truncates fractional credits (e.g. 1.5 -> 1; 0.99 -> 0) while the ledger is fractional.
2. The balance read and the debit are not row-locked: two concurrent bookings by one student could both pass the balance check.
3. No unique constraint on `lessons (teacherId, date, time)`; only `slot_openings` unique index protects slots, so teacher-created lessons (`createLesson` path) rely on app checks.

Any fix needs a migration (see `migrations-workflow.md`) and a mirrored change in the frontend local branch.
