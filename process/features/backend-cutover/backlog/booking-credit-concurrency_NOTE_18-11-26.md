---
name: note:booking-credit-concurrency
description: "Backlog: booking/credit race (no row lock) and no unique lessons (teacher, date, time) constraint"
date: 18-11-26
feature: backend-cutover
---

# Booking/credit race and lesson uniqueness

status: done-with-gap (credit race fixed 20-11-26; migration 0004 & dev lumina alignment fixed 23-11-26; prod migration rehearsal deferred)
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
   refund paths.
3. **Dev `lumina` alignment (done 23-11-26)** in
   `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-01-dev-db-migration-0004_REPORT_23-11-26.md`:
   took `pg_dump` backup, cancelled the 13 user-approved `credit-concurrency.spec.ts` test-residue rows in one
   transaction (0 deleted), applied `npm run db:migrate` (`0004`) to default dev `lumina`, and passed `npm run smoke`
   (14/14, 375 checks) and `npm run e2e` (23 API + 3 demo) with 0 active duplicate groups post-run.

## Gap

- Credit read/debit race -> **fixed (20-11-26)**.
- Active lesson uniqueness (`0004`) + dev `lumina` migration -> **fixed (23-11-26)**.
- Remaining minor deferred gap: production migration rehearsal (no hosted production DB exists in v1 scope; CI
  throwaway Postgres migration gate is scheduled in Phase 06 of `lumina-v1-finish`).

## Next step

Nothing local remains open here. CI migration gating is covered by Phase 06 (`phase-06-ci-and-docker-compose_PLAN_23-11-26.md`).
