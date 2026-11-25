---
name: note:booking-credit-concurrency
description: "Backlog: booking/credit race (no row lock) and no unique lessons (teacher, date, time) constraint"
date: 18-11-26
feature: backend-cutover
---

# Booking/credit race and lesson uniqueness

status: done-with-gap
item: B3-GAP-RACE (from b3-domain-smoke_PLAN_18-11-26, user-accepted known gap)
reason: Fixing it needs a migration (unique index on lessons) and row locking on the ledger read; both were out of scope for B3 (no schema change allowed).

## Gap

- `POST /bookings` and rebook read the balance with `getCreditBalance` and then debit inside one transaction, but the balance read is not locked. Two concurrent bookings by one student can both pass.
- No unique constraint on `lessons (teacher_id, date, time)`. Only the `slot_openings` claim (`DELETE ... RETURNING`) prevents double-booking through slots; `POST /lessons` can create overlapping lessons.

## Next step

NEW PLAN REQUIRED: lock per student (e.g. `SELECT ... FOR UPDATE` on the student profile row, or an advisory lock) before the balance read; add a partial unique index on scheduled/live lessons per teacher slot (Drizzle migration + `schema.ts` sync). Add a concurrency case to the smoke script.
