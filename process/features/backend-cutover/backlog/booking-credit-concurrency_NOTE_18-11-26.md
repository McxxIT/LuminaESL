---
name: note:booking-credit-concurrency
description: "Backlog: booking/credit race (no row lock) and no unique lessons (teacher, date, time) constraint"
date: 18-11-26
feature: backend-cutover
---

# Booking/credit race and lesson uniqueness

status: done-with-gap (credit race fixed 20-11-26; migration 0004 & enforcement fixed 23-11-26 on lumina_review; dev lumina migration open)
item: B3-GAP-RACE (from b3-domain-smoke_PLAN_18-11-26, user-accepted known gap)
reason: Fixing it needed a migration (unique index on lessons) and row locking on the ledger read; both were out of scope for B3 (no schema change allowed).

## Resolution

1. **Credit ledger serialization (done 20-11-26)** in
   `process/features/people-billing/completed/credit-ledger-serialization_20-11-26/`: a per-student
   transaction-scoped advisory lock (`lockStudentCredits`) is taken first by every credit-mutating path, and
   student cancel / teacher absence decide refunds inside the transaction (`absences.lesson_id` is unique via
   migration `0003`). Regression gate: `frontend/e2e/api/credit-concurrency.spec.ts` (3 races; a negative probe
   without the lock made both bookings succeed).
2. **Active lesson uniqueness & debit-only refunds (done 23-11-26)** in
   `process/features/lessons-scheduling/completed/booking-collision-refund-policy_20-11-26/`: partial unique
   index `lessons_active_teacher_date_time_uidx` on `(teacher_id, date, time)` where `status IN ('scheduled', 'live')`
   (migration `0004_gorgeous_maverick.sql`), strict named-constraint `409 CONFLICT` mapping across `POST /lessons`,
   `PATCH /lessons/:id`, `POST /lessons/:id/rebook`, and `POST /bookings`, plus `isLessonCharged` gating all three
   refund paths. Verified on disposable `lumina_review` via `frontend/e2e/api/booking-collision.spec.ts` (5 tests)
   and `npm run smoke` `refunds` (22 checks).

Still open: applying migration `0004` to the shared dev database `lumina`. Dev `lumina` still holds 2 active
duplicate groups (13 `scheduled` rows at `2026-11-29 06:00` and `2026-11-30 06:00`, all residue from repeated
`credit-concurrency.spec.ts` runs) and was intentionally left unmigrated pending an approved cleanup decision.
See inventory in `process/features/lessons-scheduling/completed/booking-collision-refund-policy_20-11-26/booking-collision-refund-policy_INVENTORY_21-11-26.md`.

## Gap

- `POST /bookings`, `POST /lessons`, and rebook read the balance and then debit in one transaction without
  serializing the read -> **fixed (20-11-26)**, see Resolution #1.
- No unique constraint on `lessons (teacher_id, date, time)` -> **schema, migration `0004`, and route enforcement
  fixed (23-11-26)** on `lumina_review`, see Resolution #2. **Open:** dev `lumina` remains unmigrated until its
  13 duplicate test-residue rows receive an approved cleanup decision; CI migration gate and production migration
  rehearsal remain deferred.

## Next step

Decide whether to approve a targeted cleanup of the 13 active duplicate test-residue rows in dev `lumina` so
`npm run db:migrate` can apply `0004` there without needing the `DATABASE_URL` override to `lumina_review`
(never auto-clean or run `db:reset` without explicit approval).
