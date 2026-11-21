---
name: note:booking-credit-concurrency
description: "Backlog: booking/credit race (no row lock) and no unique lessons (teacher, date, time) constraint"
date: 18-11-26
feature: backend-cutover
---

# Booking/credit race and lesson uniqueness

status: race-done (20-11-26); lessons-uniqueness-open
item: B3-GAP-RACE (from b3-domain-smoke_PLAN_18-11-26, user-accepted known gap)
reason: Fixing it needs a migration (unique index on lessons) and row locking on the ledger read; both were out of scope for B3 (no schema change allowed).

## Resolution

The credit side is fixed (20-11-26) in
`process/features/people-billing/active/credit-ledger-serialization_20-11-26/`: a per-student
transaction-scoped advisory lock (`lockStudentCredits`) is taken first by every credit-mutating path, and
student cancel / teacher absence decide refunds inside the transaction (`absences.lesson_id` is unique via
migration `0003`). Regression gate: `frontend/e2e/api/credit-concurrency.spec.ts` (3 races; a negative probe
without the lock made both bookings succeed).

Still open: no unique constraint on `lessons (teacher_id, date, time)`. The dev DB holds 2 active duplicate
groups (13 `scheduled` rows at `2026-11-29 06:00` and `2026-11-30 06:00`), all residue from repeated
`credit-concurrency.spec.ts` runs, so the index needs a disposable database or a reviewed cleanup first.
Inventory: `process/features/lessons-scheduling/active/booking-collision-refund-policy_20-11-26/`.

## Gap

- `POST /bookings`, `POST /lessons`, and rebook read the balance and then debit in one transaction without
  serializing the read -> **fixed**, see Resolution.
- No unique constraint on `lessons (teacher_id, date, time)`. Only the `slot_openings` claim
  (`DELETE ... RETURNING`) prevents double-booking through slots; `POST /lessons` can create overlapping
  lessons. **Open.**

## Next step

Open item: unique `lessons (teacher_id, date, time)` (partial on `scheduled`/`live`, or full after a data
cleanup), with a Drizzle migration + `schema.ts` sync. Do it against a disposable DB or after a reviewed
cleanup migration; never auto-clean the dev DB.
