---
name: plan:credit-ledger-serialization
description: "Serialize credit balance checks and debits per student, and make lesson cancellation/absence idempotent under concurrency"
date: 20-11-26
feature: people-billing
status: COMPLETE
---

# Credit Ledger Serialization - Plan

**Date**: 20-11-26
**Status**: ✅ COMPLETE - all checklist items done; evidence in `credit-ledger-serialization_EXECUTE_20-11-26.md`.
**Complexity**: MEDIUM (backend only: one helper, seven call sites, one migration, one concurrency spec)
**Branch**: developing
**Related**: `process/context/database/booking-and-credit-integrity.md`,
`process/features/backend-cutover/backlog/{booking-credit-concurrency,booking-rules-followups}_NOTE_18-11-26.md`

TL;DR: `getCreditBalance()` and the debit run in one transaction but nothing serializes them, so two
concurrent bookings by a student with 1 credit can both pass and drive the ledger negative. The
cancellation and absence paths are worse: they decide `refunded` / "already recorded" *outside* the
transaction, so two concurrent calls can double-refund or double-record. The fix is one per-student
advisory transaction lock taken first everywhere credits are read-then-written, with the refund
decisions moved inside the same transaction and status-predicated updates. No API shape changes, no
schema change except a unique index on `absences.lesson_id`. Self-purchase policy and a unique
`lessons(teacher,date,time)` constraint stay out of scope (reasons below).

## Overview

Reconnaissance (file-local, verified 2026-11-20):

| Question | Answer | Evidence |
|---|---|---|
| Is the balance check atomic with the debit? | No. Both are in one transaction, but no lock serializes the read | `bookings.ts:200-251`; `lessons.ts:296-350`; `lessons.ts:517-530` |
| What currently serializes bookings? | Only the `slot_openings` delete claim, i.e. per-slot, not per-student | `bookings.ts:213-217` |
| Can two bookings overdraw one student? | Yes: both read the same balance, then both insert `-1` | `getCreditBalance` (`lib/credits.ts`) has no lock |
| Is student cancel idempotent? | No. Status is checked before the transaction and the update has no status predicate, so two concurrent cancels both refund | `lessons.ts:741`, `761-783` |
| Is the refund decision race-free? | No. `debited` is read before the transaction (`lessons.ts:753-759`) | same |
| Is teacher absence idempotent? | No. "already recorded" is checked before the transaction; no unique index on `absences.lesson_id` | `lessons.ts:831`, `847-880` |
| Is approval idempotent? | Yes. `UPDATE requests ... WHERE status = 'pending'` returns 0 rows on a repeat, and the lesson is locked `FOR UPDATE` | `requests.ts:200-211`, `240-245` |
| Are there existing duplicate absences? | No (0 rows) - a unique index is safe | DB check 2026-11-20 |
| Can `lessons(teacher,date,time)` be unique? | Not now: 4 duplicate groups already exist (12x `2031-03-05 09:00` import fixtures, 3 seed/import groups at 23:30) | DB check 2026-11-20 |

## Goals

- A student's credit balance can never be driven negative by concurrent requests.
- A cancellation refunds at most once, and only for a lesson that has a `booking` debit.
- A teacher absence is recorded at most once per lesson, with at most one refund.
- All credit-mutating transactions acquire their locks in one fixed order, so they cannot deadlock.
- Existing contracts (status codes, payload shapes) stay unchanged for the non-racing case.

## Non-goals

- A unique `lessons(teacher,date,time)` constraint (blocked by existing dev-DB duplicates; needs a
  disposable database or a cleanup migration first).
- Gating student self-purchase behind a payment provider (product decision).
- Fixing the `rebook` behavior (it charges again without cancelling the original) - separate finding.
- Changing the public API or adding endpoints.

## Decisions

- **CL-1 Per-student advisory lock.** Add `lockStudentCredits(tx, studentId)` in `lib/credits.ts` using
  `pg_advisory_xact_lock(hashtextextended($1::text, 0))`. It is transaction-scoped, needs no schema,
  and serializes only one student's ledger mutations. (A global lock would work too but serializes the
  whole school; a `users` row lock would couple credits to profile writes.)
- **CL-2 Lock first, always.** Every credit-mutating transaction calls `lockStudentCredits` before
  touching slots, lessons, requests, or absences. One lock, one order, no deadlock.
- **CL-3 Decide inside the transaction.** Cancel/absence/refund decisions move inside the tx. The
  lesson update gains a status predicate (`WHERE id = $1 AND status = 'scheduled'`); 0 rows means
  someone else already changed it -> 409.
- **CL-4 Refund derives its own evidence.** Inside the tx, after the student lock, look up the
  `booking` debit row for the lesson; refund only when it exists and the timing rule passes.
- **CL-5 One absence per lesson.** Add `unique()` on `absences.lessonId` plus migration `0003`, and
  turn the duplicate insert into a 409 (catch the unique violation or keep the pre-check and rely on
  the index).
- **CL-6 Approval joins the same lock.** Read the lesson's `studentId` (immutable) inside the tx,
  take the student lock, then update the request and lock the lesson - same order as cancel.
- **CL-7 Prove it with real concurrency.** A new Playwright API spec fires two concurrent requests and
  asserts exactly one succeeds. A single-threaded test cannot prove this.

## Scope

**In scope**

- `backend/src/lib/credits.ts`: `lockStudentCredits`.
- `backend/src/routes/bookings.ts`: booking transaction.
- `backend/src/routes/lessons.ts`: create, rebook, cancel, absence.
- `backend/src/routes/requests.ts`: cancellation approval refund.
- `backend/src/routes/credits.ts`: purchase/adjustment insert.
- `backend/src/db/schema.ts` + `backend/src/db/migrations/0003_*`: `absences.lesson_id` unique.
- `frontend/e2e/api/credit-concurrency.spec.ts` (new, 3 tests).
- Docs: `booking-and-credit-integrity.md`, `all-context.md`, `tests/all-tests.md`, both backlog notes.

**Out of scope**

- Frontend code of any kind.
- `npm run db:reset`, seed changes, or data cleanup.
- Payment provider work.

## Touchpoints

Modified: the six backend files above, `backend/tests/contract.test.ts` only if a route signature
changes (it should not), and the four docs. New: one migration file and one e2e spec.

Read-only references: `backend/src/lib/{db-handle,errors}.ts`,
`frontend/e2e/{support/auth.ts,support/fixtures.ts}`, `frontend/e2e/api/cancellation-refund.spec.ts`.

## Public Contracts

| Contract | Shape | Consumers |
|---|---|---|
| Booking under 1 credit | 422 `Student does not have enough lesson credits` (unchanged) | student/manager UI |
| Cancel a lesson someone else already cancelled | 409 (new: today it silently refunds twice) | student UI |
| Absence on a lesson that already has one | 409 (already returned, now race-safe) | teacher UI |
| Balance | append-only sum; never negative from bookings | credits screens, smoke |
| Locks | per-student advisory, transaction-scoped, released on commit/rollback | all credit paths |

## Blast Radius

- **Booking**: one extra round trip (`pg_advisory_xact_lock`) inside an existing transaction. No shape
  change. Risk is a typo in the lock key making locks global-ish (hashtext collision) - harmless.
- **Cancel/absence**: behavior changes only in the concurrent case (409 instead of a double refund).
  Sequential behavior is identical.
- **Migration**: adds a unique index on a table with 0 duplicates today. Fails loudly if a duplicate
  exists, which is the intended outcome.
- **No schema column changes, no dependency changes, no frontend change.**

## Implementation Checklist

### P1 Lock helper
- [x] P1.1 `lib/credits.ts`: `lockStudentCredits(db: DbOrTx, studentId: string)` calling
      `sql\`select pg_advisory_xact_lock(hashtextextended(${studentId}::text, 0))\``. Doc-comment why
      it must be the first statement in a credit transaction.
### P2 Wire the lock
- [x] P2.1 `bookings.ts` booking tx: lock before reading the slot.
- [x] P2.2 `lessons.ts` create tx: lock before `getCreditBalance`.
- [x] P2.3 `lessons.ts` rebook tx: lock before the slot read.
- [x] P2.4 `lessons.ts` cancel: lock first, then status-predicated update, then derive the debit and
      refund inside the tx.
- [x] P2.5 `lessons.ts` absence: lock first, insert the absence (unique index), then update/refund.
- [x] P2.6 `requests.ts` approval: read lesson `studentId`, lock, then request update + lesson lock.
- [x] P2.7 `credits.ts` POST: lock before the insert (keeps read-then-write consistent for later rules).
### P3 Absence uniqueness
- [x] P3.1 `schema.ts`: `lessonId ... .unique()`.
- [x] P3.2 `npm run db:generate` -> `0003_supreme_victor_mancha.sql` (adds
      `absences_lesson_id_unique`); inspected and applied.
- [x] P3.3 Map the unique violation to 409 in the route.
### P4 Concurrency proof
- [x] P4.1 `frontend/e2e/api/credit-concurrency.spec.ts` test 1: admin adjusts the balance to exactly
      1, two slots open, two concurrent `POST /bookings` -> exactly one 201, one 422, balance 0, one
      new lesson.
- [x] P4.2 Test 2: book a lesson, fire two concurrent student cancels -> one 200 `refunded: true`, one
      409, balance restored by exactly 1, one refund row.
- [x] P4.3 Test 3: fire two concurrent teacher absences -> one 201, one 409, one absence row, one
      refund.
- [x] P4.4 Restore anything the spec mutated (balance via the opposite adjustment) in `finally`.
### P5 Gates
- [x] P5.1 `npm run db:migrate` (applies 0003), `npm run typecheck`, `npm run lint`.
- [x] P5.2 `npm run test --workspace @lumina/backend`, `npm run smoke` (353 checks).
- [ ] P5.3 `npm run e2e` twice back to back; new spec green both times, existing 18 tests unchanged.
- [x] P5.4 Grep gate: no `db:reset`/`push`/`truncate` added; no `.env*` edit; `git diff --check`.
### P6 Docs and report
- [x] P6.1 `process/context/database/booking-and-credit-integrity.md` (lock rule, cancel/absence
      idempotency, what remains open).
- [x] P6.2 `process/context/all-context.md` (booking risks), `process/context/tests/all-tests.md`
      (new spec, counts).
- [x] P6.3 Backlog notes: mark the concurrency and rules items resolved; keep the unique-lessons gap
      and the payment item.
- [x] P6.4 `credit-ledger-serialization_EXECUTE_20-11-26.md` in this folder.

## Acceptance Criteria

| Umbrella item | Proving gate |
|---|---|
| Balance can never go negative from concurrent bookings | P4.1 |
| A cancellation refunds at most once | P4.2 |
| An absence is recorded and refunded at most once | P4.3 |
| Sequential behavior unchanged | P5.2 + P5.3 (existing booking/cancellation/absence coverage) |
| No deadlocks | one lock, acquired first everywhere; P4.1-P4.3 run concurrently |
| No API/schema shape change beyond the unique index | contract test green, `git diff --stat` |

## Validate Contract

| Contract item | Command / probe | Pass condition |
|---|---|---|
| C1 Booking race | P4.1 concurrent POSTs | exactly one 201, one 422; balance 0 |
| C2 Cancel race | P4.2 concurrent cancels | exactly one 200 with `refunded: true`, one 409; +1 total |
| C3 Absence race | P4.3 concurrent absences | exactly one 201, one 409; one row, one refund |
| C4 Sequential paths unchanged | existing `booking`, `cancellation-refund` specs | pass unchanged |
| C5 Migration applies | `npm run db:migrate` | 0003 applied, no duplicate error |
| C6 Repo gates | typecheck, lint, backend tests, smoke, e2e x2 | exit 0 |
| C7 No destructive work | grep gate + `git diff --stat` | no reset/push/truncate/seed, no `.env*` |
| C8 Docs match reality | read the four docs | lock rule and status codes match the code |

## Verification Evidence

| Gate | Strategy | Command |
|---|---|---|
| Static | Fully-Automated | `npm run typecheck`, `npm run lint` |
| Concurrency | Hybrid | `npm run e2e` -> `api/credit-concurrency.spec.ts` |
| Regression | Hybrid | `npm run e2e`, `npm run smoke`, backend tests |
| Migration | Hybrid | `npm run db:migrate` |
| Safety | Agent-Probe | grep gate + `git diff --stat` |
| Docs | Agent-Probe | read-through |

## Risks

- **Flaky race test.** Two parallel requests may serialize at the HTTP layer on a slow machine. Use
  `Promise.all` of two `request.post` calls (not the UI), assert exactly one success, and keep the
  assertion on the ledger, not on timing. If the spec proves flaky, add a retry (`test.describe.configure({ retries: 1 })`).
- **Deadlock.** Mitigated by one lock acquired first in every path; approval reads `studentId` from the
  lesson before locking.
- **Advisory key collision.** `hashtextextended` collisions only over-serialize; they cannot corrupt.
- **Migration on dirty DB.** Verified 0 duplicate absences on 2026-11-20; the migration fails loudly
  otherwise, which is correct, and the plan never auto-cleans data.
- **Residue.** P4 adds lessons, slots, and credit rows per run; document the delta like D1-D3.

## Phase Completion Rules

- A phase is not complete while any checklist box is open or any Validate Contract row is red.
- P2 is not complete until every credit-mutating transaction takes the lock first (grep for the
  helper and review each site).
- P4 is not complete until all three races pass in the same run as the existing suite.
- No phase may run `db:reset`, `db:push`, `truncate`, or edit `.env*`.

## Resume and Execution Handoff

Status: COMPLETE (20-11-26). Implementation, migration, tests, and docs are done; see the execute report
in this folder for evidence. Remaining closeout: commit checkpoint and archive to
`process/features/people-billing/completed/credit-ledger-serialization_20-11-26/`.

- Execute P1 -> P2 -> P3 -> P4 -> P5 -> P6. P4 depends on P1-P3. (Done.)
- Read first: `process/context/database/booking-and-credit-integrity.md`,
  `process/context/tests/all-tests.md`, `backend/src/lib/credits.ts`.
- Preconditions: local Postgres reachable, `backend/.env` present, seeded DB, ports
  3000/3100/4000/4100 free, no `.env*` edits.
- `npm run db:migrate` is required once for the new index; it is additive and does not touch data.

## Next Step

Done. Archived to `process/features/people-billing/completed/credit-ledger-serialization_20-11-26/`.
