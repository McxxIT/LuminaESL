---
name: plan:booking-collision-refund-policy
description: "Prevent active teacher/time collisions and enforce booking-debit-only, idempotent refunds"
date: 20-11-26
feature: lessons-scheduling
phase: "single-complex-plan"
status: COMPLETE (RFC-001..RFC-004 executed and verified 23-11-26 on the disposable `lumina_review` DB; all gates green)
---

# Booking Collision and Refund Policy - Plan

**Date**: 20-11-26  
**Status**: ✅ VERIFIED - RFC-001..RFC-004 complete 23-11-26; evidence in
`booking-collision-refund-policy_EXECUTE_23-11-26.md` and INVENTORY §9
**Complexity**: COMPLEX (standard complex, one execution stream)

## TL;DR

Add an active-only PostgreSQL uniqueness guard for `(teacher_id, date, time)`, map only that
constraint's PostgreSQL `23505` result to a deterministic `409 CONFLICT`, and make create, rebook,
reschedule, and active-status transitions transactional. Separately, make every cancellation,
absence, and approved-cancellation refund require a matching `booking` debit for the same lesson
and student, without changing rebook debit policy or cancellation timing rules.

## Quick Links

- [Goals and Scope](#goals-and-scope)
- [Architecture Decisions](#architecture-decisions)
- [Data Flow and Failure Modes](#data-flow-and-failure-modes)
- [Migration and Duplicate-Data Safety](#migration-and-duplicate-data-safety)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Implementation Checklist](#implementation-checklist)
- [Verification Evidence](#verification-evidence)
- [Acceptance Criteria](#acceptance-criteria)
- [Risks](#risks)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

## Context and Goals

The SPEC requires `scheduled` and `live` lessons to have one lesson per
`teacher_id + date + time`. Cancelled and completed rows remain history and must not participate in
the collision rule. Existing active duplicates must remain untouched until a reviewer explicitly
approves a cleanup.

Goals:

1. Reject create, rebook, and reschedule moves that collide with another active lesson.
2. Reject active-status transitions that would create or retain an active collision.
3. Leave lesson, slot, and credit state unchanged when a collision is rejected.
4. Preserve cancelled/completed history and historical reuse.
5. Refund only from a matching booking debit and do so exactly once across the three cancellation
   paths.
6. Preserve existing insufficient-credit, validation, and timing behavior as distinct outcomes.

## Goals and Scope

**In scope**

- PostgreSQL partial unique index in the Drizzle schema and generated migration.
- Reviewed duplicate inventory before migration application.
- Collision handling in `POST /lessons`, `PATCH /lessons/:id`, and
  `POST /lessons/:id/rebook`.
- Collision handling for status transitions in `PATCH /lessons/:id`.
- Debit-evidence checks for student cancellation, teacher absence, and manager-approved
  cancellation.
- Regression tests for collision, concurrency, history reuse, conflict-vs-credit outcomes,
  refund-without-debit, and refund idempotence.

**Out of scope**

- Rebook policy changes: no cancellation or replacement semantics change and no additional debit
  policy change.
- Automatic deletion or merge of existing duplicate lessons.
- Changing cancellation timing or teacher-absence settings.
- Payment-provider enforcement or credit purchase limits.
- Credit locking redesign or enrollment-plan locking redesign.
- Group lessons and 25-minute-duration changes.

**Stop conditions**

- **STOP migration application** if the active duplicate inventory has not been reviewed.
- **STOP migration application** if active duplicate groups have not received a reviewed
  cleanup decision.
- **NO automatic deletion or merge** may be included in this work.
- **NO rebook semantic expansion** may be included.
- **NO source-code implementation may begin** until PLAN moves to VALIDATE and is accepted.

## Architecture Decisions

**BC-1 - Partial unique index**

- Add a named partial unique index on `lessons(teacher_id, date, time)` with a predicate covering
  only `status IN ('scheduled', 'live')`.
- The key is exactly the teacher/date/start-time tuple. It does not include student or end time.
- Add the index to `backend/src/db/schema.ts` and generate the SQL migration plus journal/snapshot.

**BC-2 - Database-authoritative enforcement**

- Application prechecks may improve response messages, but the partial index is the final
  concurrency guard.
- Database 23505 handling is deliberate narrow mapping: inspect the constraint name and map only
  `lessons_active_teacher_date_time_uidx` to `409 CONFLICT`. Do not replace all 23505 handling with
  an active-collision response.
- Suggested conflict message: `That teacher already has an active lesson at this date and time`.

**BC-3 - Transaction atomicity**

- Create: retain the per-student lock, check balance, perform the lesson insert, insert the booking
  debit, and write activity in the existing transaction. A collision insert exception rolls back
  lesson, debit, slot, and activity work.
- Rebook: preserve current behavior. Keep the existing per-student lock and slot claim/delete,
  lesson insert, debit, and activity in one transaction. A collision must roll back slot deletion
  and the new debit.
- Reschedule/status patch: perform active-target collision decision and lesson update in one
  transaction. This prevents an active-status transition from committing independently of its
  collision check.
- Student cancellation and absence approval: no collision mutation occurs, but all refund decisions
  remain inside the existing credit-lock transaction.

**BC-4 - Booking-debit evidence**

- A refundable lesson must have exactly evidence matching the same lesson and student:
  `credit_entries.reason = 'booking'` and `credit_entries.lesson_id = lesson.id`.
- Matching `student_id` must also be verified before adding the refund. A debit for another student
  or another lesson is not evidence.
- Adjustments and unrelated ledger entries are not booking evidence.
- If no matching debit exists, cancellation or absence cancels/records without a refund.

**BC-5 - Idempotence remains status/absence driven**

- Student cancel keeps the scheduled status predicate and one refund under the student advisory lock.
- Teacher absence keeps its unique absence row and the scheduled-to-cancelled transition as the
  refund gate.
- Manager-approved cancellation keeps the pending request predicate and lesson lock; only a true
  scheduled/live -> cancelled transition may refund.

## Data Flow and Failure Modes

```text
Create / rebook / reschedule / status update
  -> enter existing transaction
  -> acquire credit lock if debit or ledger mutation is involved
  -> determine target teacher/date/time/status
  -> insert/update lesson
  -> partial unique index evaluates only scheduled/live rows
  -> success: commit lesson + debit/slot/activity as applicable
  -> 23505 for named index: rollback whole transaction, 409 CONFLICT
  -> other 23505 or DB error: retain existing error handling; never relabel as collision
```

```text
Cancellation / absence / manager approval
  -> enter credit-lock transaction
  -> atomically update request/absence/lesson state
  -> find matching booking debit for lesson + student
  -> no debit: cancel or record absence, refunded=false, no credit entry
  -> matching debit and eligible: insert exactly one refund
  -> repeat: status or unique gate rejects or resolves without another refund
  -> commit/rollback applies state and ledger together
```

Failure modes:

1. Concurrent create/rebook/reschedule: exactly one insert/update wins; index loser receives
   the collision 409 and its transaction rolls back.
2. Insufficient credit: return existing balance rejection (`422`) before or after collision
   precheck, but never fabricate a booking debit or lesson.
3. Invalid Zod input: remain `400 VALIDATION_ERROR`; collision logic is not validation.
4. No active collision: no 409; preserve existing debit and rebook behavior.
5. Cancelled/completed duplicate: index predicate excludes it and permits a new active row.
6. Existing active duplicate: migration preflight blocks application; no runtime cleanup is added.
7. Matching booking debit adjusted later or absent: no refund, even if the cancellation settings
   would otherwise permit one.
8. Repeat cancellation/absence/approval: no second refund and no extra state transition.

## Migration and Duplicate-Data Safety

Migration target: next journal migration, `0004_<generated-name>.sql`.

Preflight is mandatory in this order:

1. Back up or snapshot the disposable/review database according to the existing local migration
   workflow; never run `db:reset`.
2. Run this inventory on the active database:
   - query `teacher_id, date, time, count(*)` for lessons with
     `status IN ('scheduled', 'live')`, grouped by those columns.
   - export the complete lesson IDs and fields needed for reviewer identification.
   - distinguish duplicate groups containing only `cancelled/completed` history.
3. Present the active duplicate inventory to the authorized reviewer.
4. Record the reviewer result in the plan/report/handoff:
   `no active duplicates` or `reviewed cleanup approved` or `blocked`.
5. Do not run `npm run db:migrate` for this migration until the reviewer result is `no active
   duplicates` or a separate approved cleanup procedure has completed.
6. If active duplicates exist: stop. Do not delete, merge, reassign, cancel, or change them.
7. Generate the migration from `backend/src/db/schema.ts`, inspect SQL, and verify the predicate
   and index name before application.
8. Apply only to a local/disposable/review database with the migration command; never use
   `db:push`, reset, truncate, or production access.
9. Post-migration verify the index with `pg_indexes`/`pg_constraint`.
10. Run duplicate inventory again; cancelled/completed history must remain unchanged.

Inventory result must be recorded, not inferred from test data. The plan must not claim migration
safety solely because a disposable test database can apply successfully.

## Phased Execution Workflow

This plan uses one main execution stream with four verification gates:

**RFC-001 - Migration and schema guard** ✅ complete 23-11-26 (evidence: INVENTORY §9)  
Apply only after the duplicate inventory stop/gate passes. Prove the partial predicate and migration
artifact. Exit when schema and local migration are green and no active duplicates remain in the
review database.

**RFC-002 - Collision enforcement** ✅ complete 23-11-26 (evidence: EXECUTE §1, §2)
Implement create, rebook, reschedule, and status-transition enforcement and strict 23505 mapping.
Exit when every collision scenario rolls back lesson/debit/slot/activity work.

**RFC-003 - Refund debit evidence** ✅ complete 23-11-26 (evidence: EXECUTE §1, smoke `refunds`)
Update absence and approval paths, preserve student cancellation behavior, and prove
refund-without-debit across all paths. Exit when no refund entry can be minted without matching
booking evidence.

**RFC-004 - End-to-end proof and handoff** ✅ complete 23-11-26 (evidence: EXECUTE §2-§4)
Run the smoke and Playwright gates, migration inventory/dry-run, static checks, and repeat runs.
Exit only with full evidence and a handoff report.

## Phase Completion Rules

No RFC is complete until:

1. Integration behavior is tested against another system piece.
2. Manual/API behavior can be confirmed through the specified request.
3. Database/state is queried and changed rows are measured.
4. The exact collision or refund failure case is proved.
5. A human reviewer has available evidence to confirm the result.

Status meanings: ⏳ PLANNED, 🔨 CODE DONE, 🧪 TESTING, ✅ VERIFIED, 🚧 BLOCKED.

## Touchpoints

**Backend, direct**

- `backend/src/db/schema.ts`
- `backend/src/db/migrations/0004_<generated-name>.sql`
- `backend/src/db/migrations/meta/_journal.json`
- `backend/src/db/migrations/meta/*.json`
- `backend/src/routes/lessons.ts`
- `backend/src/routes/requests.ts`
- `backend/src/routes/bookings.ts` (absorbed during RFC-002 — see Change Management)
- `backend/src/lib/credits.ts` (`isLessonCharged` refund gate)
- `backend/src/lib/errors.ts` only if a narrow constraint-name helper is added
- `backend/scripts/smoke.ts`

**Tests and evidence**

- `frontend/e2e/api/booking.spec.ts`
- `frontend/e2e/api/cancellation-refund.spec.ts`
- `frontend/e2e/api/credit-concurrency.spec.ts`
- `frontend/e2e/api/booking-collision.spec.ts` (new)
- `frontend/e2e/support/api.ts` only if fixture helpers require it
- `frontend/playwright.config.ts` (e2e backend env only)
- `backend/tests/contract.test.ts` only if route/public shape changes

**Read-only context and prior work**

- `process/context/database/all-database.md`
- `process/context/database/migrations-workflow.md`
- `process/context/database/schema-and-models.md`
- `process/context/database/booking-and-credit-integrity.md`
- `process/context/tests/all-tests.md`
- `process/features/backend-cutover/backlog/booking-rules-followups_NOTE_18-11-26.md`
- `process/features/backend-cutover/backlog/rebook-enrichment_NOTE_18-11-26.md`
- `process/features/people-billing/completed/credit-ledger-serialization_20-11-26/`

**No change**

- `frontend/app/lib/school/services/*` and other frontend services are out of scope unless an existing
  contract is found to differ during RFC-002. No API payload or schema shape is planned.

## Public Contracts

| Operation | Existing behavior retained | Changed behavior |
|---|---|---|
| `POST /lessons` | 400 `BAD_REQUEST` for insufficient credit (unchanged; the plan's earlier "422" note was inaccurate); existing booking debit | Active collision: 409 `CONFLICT` and no lesson/debit/activity |
| `PATCH /lessons/:id` | Existing status, date, time, and field update behavior | Moving/updating to another scheduled/live teacher slot collision: 409 and transaction rollback |
| `PATCH` status transition | Existing status transitions | Any transition that leaves a lesson scheduled/live at an occupied key: 409 |
| `POST /lessons/:id/rebook` | Current rebook debit/original-lesson behavior stays unchanged | Collision: 409 and no new lesson, slot deletion, debit, or activity |
| `POST /bookings` (student booking) | Existing slot claim, 422 insufficient credit, 409 taken slot | Collision on the lesson key: 409 `CONFLICT`, slot claim and debit rolled back |
| Student cancellation | Existing timing and 200 `refunded` response | Refund only if matching lesson/student booking debit exists |
| Teacher absence | Existing 201 and settings gate | Refund only if matching lesson/student booking debit exists |
| Manager-approved cancellation | Existing pending/request and completed/cancelled guards | Refund only on a real transition and matching lesson/student booking debit |
| Insufficient credit | 422 message is preserved | Distinct from 409 collision |
| Validation | 400/Zod errors are preserved | Not remapped to collision |

The public JSON shape need not change. Collision users receive:
`{ "error": { "code": "CONFLICT", "message": "That teacher already has an active lesson at this date and time" } }`.

## Blast Radius

- **Packages**: backend and Playwright API tests.
- **Schema**: one named partial unique index and one migration.
- **Routes**: `lessons.ts`, `requests.ts`, `bookings.ts` (`POST /bookings` absorbed during RFC-002).
- **Data**: lesson, slot, and credit mutations are rollback-sensitive. Cancelled/completed history
  must remain unchanged.
- **Test files**: at least two new Playwright specs plus updated smoke coverage.
- **Risk class**: schema/migration, public API, concurrent data mutation, destructive-data boundary.
- **Migration blast**: active duplicate inventory and reviewed cleanup gate are mandatory; no
  destructive SQL is authorized.

## Implementation Checklist

### RFC-001 - Migration and inventory

1. Query and export active duplicate groups by `(teacher_id, date, time)` with all affected lesson
   IDs and statuses.
2. Classify duplicate groups and obtain an explicit reviewed result; stop if any active duplicate
   lacks a cleanup decision.
3. Confirm cancelled/completed-only groups are historical and require no cleanup.
4. Add a named partial unique index to `lessons` in `backend/src/db/schema.ts`.
5. Run `npm run db:generate`; inspect `0004_<generated-name>.sql`, `_journal.json`, and snapshot
   for the exact predicate and index name.
6. Apply the migration to a disposable/review local database only; run a post-migration duplicate
   inventory and index metadata check.

### RFC-002 - Collision enforcement ✅ (items 7-11 done 23-11-26)

7. In `POST /lessons`, keep the per-student lock and all debit/slot/lesson/activity work inside
   the transaction; catch only the named partial-index 23505 violation and return 409.
8. In `POST /lessons/:id/rebook`, preserve current rebook semantics and move/catch collision
   handling without adding cancellation or replacement behavior; ensure slot deletion and debit
   roll back on collision.
9. In `PATCH /lessons/:id`, determine target teacher/date/time/status and execute the update in a
   transaction so active target changes are collision-authoritative.
10. Ensure date/time changes, teacher changes where permitted, and `status` changes to
    `scheduled/live` use the same collision outcome. A status change to completed/cancelled does
    not collide.
11. Map the named constraint 23505 to the one 409 message; leave all other unique violations under
    their existing handlers and leave 422/400/403/404 behavior unchanged.

### RFC-003 - Refund evidence ✅ (items 12-16 done 23-11-26)

12. In the student cancel transaction, retain the scheduled status predicate and re-read matching
    `booking` debit evidence inside the per-student lock.
13. In the teacher absence transaction, retain the absence unique gate and status transition;
    derive `refundEnabled && matching booking debit && real cancelled transition`.
14. In manager-approved cancellation, after taking the student lock and locking the lesson, query
    matching booking debit evidence before inserting a refund.
15. Enforce matching lesson and student for all refund evidence; adjusted-away, another-lesson,
    or another-student entries produce no refund.
16. Preserve repeat/repeated approval behavior: no extra absence, cancellation, or refund.

### RFC-004 - Tests and verification ✅ (items 17-23 done 23-11-26)

Executed as: `frontend/e2e/api/booking-collision.spec.ts` (items 17-19, plus concurrency in item 18),
smoke `refunds` scenario (item 20 and the idempotence half of item 21), the existing
`credit-concurrency` race tests (item 21), the full gate order (item 22), and
`booking-collision-refund-policy_EXECUTE_23-11-26.md` (item 23). Two existing specs needed
collision-aware cleanup — see EXECUTE §5.5.

17. Add a create/reschedule/rebook active-collision Playwright scenario.
18. Add a concurrent create or reschedule collision scenario asserting one winner and one 409.
19. Add historical reuse assertions for cancelled/completed lessons sharing a key.
20. Add conflict-vs-credit and no-debit/adjusted-debit refund scenarios to smoke or Playwright.
21. Add cancellation, absence, and approval idempotence assertions to existing/new specs.
22. Run static, migration, backend, smoke, and Playwright gates in the exact order documented below.
23. Write the execution evidence/report and update context only for durable operational findings.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Migration preflight inventory and reviewed gate | Agent-Probe | AC5, AC6 |
| Migration SQL/predicate and post-migration index check | Hybrid | AC5, AC6 |
| Create collision: lesson, debit, slot, activity unchanged | Hybrid | AC1 |
| Reschedule collision: lesson fields unchanged | Hybrid | AC1 |
| Rebook collision: no new lesson/debit/slot mutation | Hybrid | AC1, AC2 |
| Active-status transition collision | Fully-Automated | AC1, AC2 |
| Concurrent collision one winner/one 409 | Hybrid | AC3 |
| Cancelled/completed key reuse | Hybrid | AC4, AC5 |
| Conflict versus insufficient credit versus 400 validation | Fully-Automated | AC2, AC11 |
| Student cancellation matching debit/timing | Hybrid | AC7 |
| Teacher absence matching debit and first transition | Hybrid | AC8 |
| Repeat cancel/absence/manager approval | Fully-Automated | AC9 |
| Cancellation/absence no debit | Hybrid | AC10 |
| Adjusted-away debit | Hybrid | AC12 |
| Existing sequential booking/cancel/absence smoke/e2e | Hybrid | AC11 and sequential preservation |

Test files and exact commands:

> **Actual results (23-11-26, `lumina_review`)**: typecheck ✅, lint ✅, backend Vitest 30/30 ✅,
> smoke 14/14 domains / 375 checks ✅, `e2e:api` 23/23 twice ✅, `e2e:demo` 3/3 ✅, 0 active
> duplicate groups after both runs. Full table in `booking-collision-refund-policy_EXECUTE_23-11-26.md`
> §2; AC mapping in §3.

- `npm run typecheck`
- `npm run lint`
- `npm run test --workspace @lumina/backend`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run smoke`
- `npm run e2e:api --workspace @lumina/frontend`
- `npm run e2e` for full API + demo regression
- `git diff --check`

Mode A red-first for new fully automated behavior:

- Add failing assertions for the conflict response and refund-without-debit behavior before
  implementation.
- Run the smallest relevant command and confirm it fails for the missing behavior.
- Implement the exact route/schema/migration change and rerun until green.

Database evidence queries:

- Active duplicate inventory query and export.
- `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'lessons'`.
- Count booking, refund, and cancellation rows by `lesson_id/student_id` before and after each test.
- Verify an attempted collision leaves lesson count, slot state, credit balance, and activity count
  unchanged.

Manual/API probes:

- Create a unique future teacher/date/time and verify 201.
- Repeat create/reschedule/rebook at that key and verify 409.
- Use another teacher, same date/time: success.
- Use cancelled/completed lesson history at the key: success.
- Create/mark no-debit fixture and verify cancellation/absence no refund.

## Acceptance Criteria

- **AC1**: Create or active change at an occupied scheduled/live key rejects 409 and rolls back
  lesson, slot, debit, and activity changes. `proven by: create/reschedule/rebook collision gates;
  strategy: Hybrid`
- **AC2**: Create/rebook/reschedule conflicts use deterministic 409; insufficient credit keeps its
  existing status (`400 BAD_REQUEST` on `POST /lessons`, `422` on `POST /bookings`) and validation
  remains 400/validation-shaped. `proven by: API smoke plus Playwright conflict-vs-credit
  scenario; strategy: Fully-Automated`
- **AC3**: Concurrent active create/rebook/reschedule attempts yield one winner and named-index
  conflict losers with no extra debit or slot mutation. `proven by: new concurrent Playwright
  scenario; strategy: Hybrid`
- **AC4**: Cancelled/completed rows do not block active reuse of the same key.
  `proven by: API smoke plus migration/history scenario; strategy: Hybrid`
- **AC5**: Cancelled/completed duplicate groups remain unchanged.
  `proven by: migration inventory and post-migration review; strategy: Agent-Probe`
- **AC6**: Existing active duplicates remain available and cannot be auto-cleaned.
  `proven by: preflight inventory/reviewer stop gate; strategy: Agent-Probe`
- **AC7**: Student cancellation refunds only for matching booking debit and timing eligibility.
  `proven by: existing cancellation smoke/spec plus refund-consistency test; strategy: Hybrid`
- **AC8**: Teacher absence refunds only for matching debit and first transition.
  `proven by: Playwright absence and smoke absence scenarios; strategy: Hybrid`
- **AC9**: Repeated cancel, absence, or approval cannot add a second refund.
  `proven by: Playwright concurrency and repeat approval cases; strategy: Fully-Automated`
- **AC10**: No-debit cancellation/absence emits no refund.
  `proven by: refund-consistency API scenario; strategy: Hybrid`
- **AC11**: Collision remains distinguishable from insufficient credit.
  `proven by: Playwright booking/credit collision and API smoke; strategy: Fully-Automated`
- **AC12**: Adjusted-away or unrelated ledger entries do not mint refunds.
  `proven by: refund-consistency API scenario; strategy: Hybrid`

## Risks

| Risk | Mitigation / stop condition |
|---|---|
| Existing active duplicates block migration | Mandatory inventory; stop and require reviewer cleanup decision; no cleanup code |
| A broad 23505 catch relabels other constraint violations | Match exact constraint name `lessons_active_teacher_date_time_uidx`; otherwise rethrow existing handler |
| Collision precheck and database insert race | Database partial index remains authoritative; loser transaction rolls back |
| Rebook path widens policy | Preserve original behavior exactly; implement only collision rejection |
| Rebook debit or slot deletion commits on loser | Put all writes in one transaction and catch named-index violation inside it |
| Cancellation or absence refunds without debit | Query matching lesson+student booking debit inside transaction before insert |
| Manager approval refunds already-cancelled lesson | Retain lesson lock/status transition predicate; only transition when scheduled/live |
| Concurrent refund and cancellation | Retain per-student advisory lock and existing status/absence/approval predicates |
| Test data residue makes repeat counts unstable | Use unique lesson IDs and `diff` fixtures; restore ledger and close disposable slots in `finally` |
| Migration applied to wrong database | Smoke/local guard, local-host guards, explicit preflight, no production or destructive command |
| User confirmation unavailable | Phase remains TESTING/BLOCKED until database evidence and manual/API confirmation are recorded |

### Scenario risk checks

- **Concurrent collision**: If the two requests return two successes, reject the implementation and
  inspect whether the index is present or an application transaction bypasses it.
- **Collision plus debit**: If the 409 leaves a debit or lesson, roll back and fix transaction
  boundaries before proceeding.
- **No-debit fixture**: If absence or approval refunds +1, stop the phase and trace every
  refund insert for matching evidence.
- **Adjusted debit**: Never infer that an old positive/negative balance counts as booking evidence.
- **Cancelled/completed reuse**: If an historical row blocks an active insert, correct the partial
  predicate, not the data.
- **Existing active duplicates**: Migration is blocked; no runtime duplicate cleanup is implied.

## Data Verification and Rollback

- Migration rollback: remove only the newly added migration/application slice from the plan's
  execution commit; no data is deleted. Revert schema and migration together; do not hand-edit
  `_journal.json` or snapshots.
- Runtime collision rollback: verify no lesson/debit/activity/slot changes at the DB level.
- Refund rollback: verify no refund row exists for no-debit/adjusted-debit fixtures.
- Test failure: correct in-place if in blast radius. Route unrelated material widening to a new
  follow-up plan/backlog; do not silently widen this plan.
- Destructive commands prohibited: `db:reset`, `db:push`, `TRUNCATE`, test/database deletion,
  and production access.

## Resume and Execution Handoff

- **selected plan file**:
  `process/features/lessons-scheduling/active/booking-collision-refund-policy_20-11-26/booking-collision-refund-policy_PLAN_20-11-26.md`
- **last completed phase or step**: all four RFCs complete on 23-11-26.
  - RFC-001 (inventory + schema guard): partial unique index `lessons_active_teacher_date_time_uidx`
    on `(teacher_id, date, time)` where `status in ('scheduled','live')`; generated migration
    `0004_gorgeous_maverick.sql`; applied only to `lumina_review`. Evidence: INVENTORY §9.
  - RFC-002 (collision enforcement): `POST /lessons`, `PATCH /lessons/:id`, `POST /lessons/:id/rebook`,
    and `POST /bookings` map only the named-index `23505` to `409 CONFLICT`; the PATCH route now runs
    its update plus both activity writes in one transaction. Evidence: EXECUTE §1.
  - RFC-003 (refund debit evidence): `isLessonCharged()` gates student cancel, teacher absence, and
    manager approval on a `booking` debit for the same lesson **and** student whose net is still
    negative. Evidence: EXECUTE §1, smoke `refunds` (22 checks).
  - RFC-004 (proof): new `booking-collision.spec.ts` (5 tests), smoke `refunds` scenario, collision-aware
    cleanup in `booking.spec.ts` and `credit-concurrency.spec.ts`, `RATE_LIMIT_MAX=100000` on the e2e
    backend webServer. Evidence: EXECUTE §2-§4.
- **validate-contract status**: CONDITIONAL, accepted; every hard execute-agent gate (E1-E8) is now
  satisfied and recorded in the EXECUTE report.
- **supporting context files loaded**:
  `process/context/all-context.md`,
  `process/context/database/all-database.md`,
  `process/context/database/migrations-workflow.md`,
  `process/context/database/schema-and-models.md`,
  `process/context/database/booking-and-credit-integrity.md`,
  `process/context/tests/all-tests.md`,
  and the people-billing/credit-ledger plan plus relevant cutover backlog notes.
- **next step for a fresh agent**: none for this plan — it is verified and ready to archive. Follow-up
  work lives outside this plan: (a) decide whether/when to migrate dev `lumina` (still 13 duplicate
  rows, needs an approved cleanup decision), and (b) the deferred items in EXECUTE §6 (CI migration
  gate, production migration rehearsal).
- **database targets**:
  - dev / residue DB: `lumina` (207 scheduled / 68 completed / 189 cancelled; 13 active duplicate rows;
    no partial index) — **never migrated by this plan**.
  - disposable review DB: `lumina_review` (migrations `0000`-`0004` applied, seeded, partial index
    present, 0 active duplicates) — every gate above ran against it via a `DATABASE_URL` override.
- **known open decision**: `backend/.env` still points `DATABASE_URL` at `lumina`, so a bare
  `npm run e2e` / `npm run smoke` targets the unmigrated dev DB. Until the dev cleanup is approved,
  export `DATABASE_URL=postgres://lumina:<pw>@localhost:5432/lumina_review` before those commands.
- **verification commands (review DB)**:
  ```powershell
  $env:DATABASE_URL='postgres://lumina:mr6jgX6gaPhJaxQ2xT-Oadn_ifLwWF2c@localhost:5432/lumina_review'
  npm run typecheck
  npm run lint
  npm run test --workspace @lumina/backend
  npm run smoke
  npm run e2e:api --workspace @lumina/frontend
  npm run e2e:demo --workspace @lumina/frontend
  ```

## Test Infra Improvement Notes

- Existing Playwright API tests use a shared dev DB and can leave residue.
- The new concurrent collision and refund-consistency coverage should use unique IDs and restore
  ledger/slot state in `finally`.
- A disposable test database remains a stronger setup for migration and concurrent proof; until
  available, document residue and rerun back-to-back.
- (none identified yet beyond the repository's existing shared-DB residue documentation)

## Validate Contract

Status: CONDITIONAL
Date: 20-11-26
date: 2026-11-20
generated-by: inner-pvl: phase-1

Parallel strategy: parallel-subagents
Rationale: 4/7 signals — schema/public API and high-risk migration/concurrency scope; the four dimension checks and section checks are independent read-only reviews.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1/AC2 | Active create, reschedule, status change, and rebook collision returns 409 and preserves lesson/debit/slot/activity state | Hybrid | `npm run e2e:api --workspace @lumina/frontend` with the new collision spec; verify DB deltas and exact `CONFLICT` response | B |
| AC3 | Concurrent active claims produce one winner and one named-index conflict loser | Hybrid | `npm run e2e:api --workspace @lumina/frontend` with two concurrent API requests against disposable/review DB | B |
| AC4 | Cancelled/completed history does not block active reuse | Hybrid | `npm run smoke` plus migration/history scenario against the review DB | B |
| AC5/AC6 | Historical rows remain unchanged and active duplicate groups are not silently deleted or merged | Agent-Probe | Review exported preflight inventory, reviewer decision, post-migration inventory, and row counts | D |
| AC7/AC8/AC9 | Cancellation, absence, and approval refund only matching booking debits and remain idempotent | Hybrid | `npm run e2e:api --workspace @lumina/frontend` using existing concurrency specs plus refund-consistency scenarios | B |
| AC10/AC12 | No-debit, adjusted-away, other-student, and other-lesson entries never create refunds | Hybrid | `npm run smoke` plus the new refund-consistency API scenario; compare ledger rows by lesson/student | B |
| AC11 | Collision, insufficient credit, and validation errors remain distinct | Fully-Automated | `npm run e2e:api --workspace @lumina/frontend` conflict-vs-credit/validation assertions | B |

Failing stub:
test("should return a deterministic conflict and preserve state for active collisions", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: return a deterministic conflict and preserve state for active collisions")
})

Failing stub:
test("should distinguish collision from insufficient credit and validation errors", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: distinguish collision from insufficient credit and validation errors")
})

Dimension findings:
- Infra fit: CONCERN — Drizzle/PostgreSQL and local Playwright infrastructure fit the design, but migration application requires a reviewed duplicate inventory and a disposable/review database; no migration file exists yet by design.
- Test coverage: CONCERN — existing credit-lock, cancellation, absence, booking, smoke, and Playwright infrastructure is real and relevant, but migration safety and duplicate preservation remain manual/probe evidence and the two new specs are not present yet.
- Breaking changes: CONCERN — the planned 409 `CONFLICT` response is a public behavior change for collision cases; the plan lists the affected routes and preserves 400/403/404/422 behavior, but route-level contract assertions must be added.
- Security surface: PASS — no auth, secret, permission, or payment-provider boundary is redesigned; integrity risk is addressed through transaction rollback, exact student/lesson debit matching, and existing locks.
- RFC-001 migration and inventory: CONCERN — mechanics and stop conditions are explicit, but the live duplicate inventory/reviewer result is intentionally absent before execution.
- RFC-002 collision enforcement: CONCERN — targets are present and the partial index is the correct concurrency authority; route transaction boundaries and exact constraint-name mapping must be verified during execution.
- RFC-003 refund evidence: PASS — the plan aligns with the existing advisory-lock, status-predicate, absence-uniqueness, and booking-debit model; matching lesson and student are explicitly required.
- RFC-004 tests and verification: CONCERN — commands are exact, but the new collision/refund specs and migration evidence do not yet exist, and shared-DB residue requires unique fixtures and `finally` cleanup.

Open gaps:
- Live active-duplicate inventory and authorized reviewer result are not yet recorded; migration must remain blocked until this evidence exists.
- Disposable/review database availability is not confirmed; shared development DB must not be used for migration application.
- New `booking-collision.spec.ts` and `refund-consistency.spec.ts` are planned but not yet present.
- AC5/AC6 remain Agent-Probe evidence rather than automated assertions.
- No CI job runs the migration or Playwright gates.

What This Coverage Does NOT Prove:
- `npm run typecheck`, `npm run lint`, and backend Vitest do not prove PostgreSQL partial-index behavior or transaction rollback.
- Playwright API tests do not prove production-scale concurrency, production deployment configuration, or absence of all historical duplicates.
- Migration SQL review and `pg_indexes` inspection do not prove that the migration was applied to the intended production database.
- Agent review of duplicate inventories does not prove a future cleanup procedure is safe; no cleanup or merge is authorized by this plan.
- Refund scenarios do not prove payment-provider enforcement or the deferred rebook policy.

Legacy line form (retained so existing validate-contract consumers still parse):
- Collision enforcement: Fully-automated: `npm run e2e:api --workspace @lumina/frontend` | hybrid: same command + local PostgreSQL/review DB and DB row-count checks | agent-probe: migration inventory/reviewer gate | known-gap: production-scale concurrency and CI
- Refund integrity: Fully-automated: backend typecheck/lint/Vitest for static regressions | hybrid: `npm run smoke` and `npm run e2e:api --workspace @lumina/frontend` + seeded local PostgreSQL | agent-probe: ledger evidence review | known-gap: payment-provider enforcement
- Migration safety: Fully-automated: `git diff --check` | hybrid: `npm run db:generate` then `npm run db:migrate` on disposable/review DB | agent-probe: duplicate inventory and reviewer decision | known-gap: production migration rehearsal

Execute-agent instructions:
- E1: Before `npm run db:migrate`, export the complete active duplicate inventory and record `no active duplicates`, `reviewed cleanup approved`, or `blocked`. Any `blocked` result stops RFC-001.
- E2: Never delete, merge, reassign, cancel, or silently alter existing active duplicates. Do not invent cleanup SQL.
- E3: Generate migration from `backend/src/db/schema.ts`; inspect SQL, `_journal.json`, and the snapshot. Confirm the exact predicate `status IN ('scheduled','live')` and exact index name `lessons_active_teacher_date_time_uidx`.
- E4: Catch and map only PostgreSQL `23505` for that named index. Re-throw or preserve existing handling for every other unique violation and retain 400/403/404/422 behavior.
- E5: Keep create, rebook, reschedule/status update, debit, slot, activity, and refund writes inside their existing transactions and verify rollback using before/after DB counts.
- E6: Use unique fixture IDs and restore balances/slots in `finally`; never use `db:reset`, `db:push`, `TRUNCATE`, test deletion, or production access.
- E7: Do not expand rebook semantics. Do not redesign advisory credit locking, enrollment-plan locking, cancellation timing, absence settings, or payment enforcement.
- E8: Do not mark the phase complete until migration evidence, duplicate review, exact conflict assertions, no-debit/adjusted-debit refund evidence, and repeat-run results are recorded.

Known gaps:
- Production-scale concurrency and production migration rehearsal are deferred; create a follow-up plan if required.
- CI coverage for PostgreSQL migration and Playwright gates is deferred to the existing CI backlog.
- Rebook semantics remain deferred as explicitly approved; this plan only rejects collisions.

Gate: CONDITIONAL (concerns noted; migration and duplicate-data evidence are mandatory execution gates)
Accepted by: session — user explicitly requested this validation run; conditional concerns remain recorded as hard execute-agent gates.

## Autonomous Goal Block

SESSION GOAL: Validate and safely implement active-only booking collision enforcement and booking-debit-only, idempotent refunds without deleting or merging lesson history.

Autonomy rules: Work only within the approved plan blast radius. Preserve cancelled/completed history. Keep existing credit and enrollment locking. Record evidence for every migration and ledger decision.

Hard stops: Stop migration if active duplicates are not inventoried and reviewed. Never use destructive database commands. Never silently delete or merge duplicates. Do not expand rebook semantics or treat a collision as insufficient credit.

Next phase: none — RFC-001 through RFC-004 are complete and verified (23-11-26). Remaining work is
outside this plan: an approved decision on migrating dev `lumina`, plus the deferred CI migration gate
and production migration rehearsal.

Contract summary: CONDITIONAL. The design is feasible, but execution requires duplicate-inventory review, disposable/review database evidence, exact named-constraint mapping, transaction rollback proof, and no-debit refund proof.

Execute start command: Begin with the active duplicate inventory and reviewer gate. Only after it passes, run `npm run db:generate`, inspect the generated migration, and apply it only to the approved disposable/review database.

## Cursor + RIPER-5 Guidance

- In Cursor Plan mode, execute this checklist RFC in order.
- In RIPER-5, PLAN is complete after this artifact and validation. Do not enter EXECUTE until
  `ENTER VALIDATE MODE` is explicitly used and the validate-contract is accepted.
- After each RFC: stop, run its test procedure and database verification, and record the result.
- If scope changes: pause, update this plan through Change Management, and require re-validation.

## Change Management

Scope changes require an impact classification and plan update before implementation:

- **Additive test/guard**: absorb only if no public API or migration blast-radius expansion.
- **Migration/cleanup change**: stop; require authorized cleanup decision and route through a
  follow-up plan/backlog.
- **Rebook behavior change**: remove from this plan and defer to a separate rebook plan.
- **Refund policy change**: remove from this plan and defer; this plan only implements booking-debit
  evidence and idempotence.
- **Public response change**: require validate-contract amendment and affected Playwright/spec updates.

### Applied during execution (23-11-26)

| Change | Classification | Rationale |
|---|---|---|
| `POST /bookings` collision guard added | Additive test/guard | The student booking path inserts a lesson; without the guard an occupied key would return an unhandled `23505` (500). Same named-index check, same 409 body, no new policy or payload shape. |
| `frontend/playwright.config.ts` sets `RATE_LIMIT_MAX=100000` on the e2e backend | Additive test/guard | The suite outgrew the 300/min default and later specs got `429` on `/health`; `smoke.ts` already sets the same value. Production and `.env` behavior unchanged. |
| `isLessonCharged` also requires a net-negative lesson balance | Additive guard inside the approved refund contract | BC-4 describes a `booking` row; AC12 requires an adjusted-away debit not to refund. Both hold when the row must exist *and* the lesson's ledger net stays negative. |
| `booking.spec.ts` / `credit-concurrency.spec.ts` cleanup made collision-aware | Additive test/guard | Both specs accumulated one scheduled lesson per run at a fixed key, which the new index rejects — the self-collision predicted in INVENTORY §8. |
| Insufficient-credit status on `POST /lessons` left at 400 `BAD_REQUEST` | No change (documentation fix) | Existing behavior preserved; the SPEC only requires collision to be distinguishable. `POST /bookings` keeps its own 422. |
