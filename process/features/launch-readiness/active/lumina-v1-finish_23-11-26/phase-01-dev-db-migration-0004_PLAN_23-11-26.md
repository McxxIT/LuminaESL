---
name: plan:lumina-v1-finish-phase-01-dev-db-migration-0004
description: "Lumina ESL v1 Finish — Phase 01: Dev DB duplicate review, approved cleanup, and migration 0004 alignment"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-01
---

# Phase 01 — Dev DB Migration 0004 Alignment

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ✅ VERIFIED
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-01-dev-db-migration-0004_REPORT_23-11-26.md (flat in the program task folder)

---

## Purpose

Bring the default development PostgreSQL database (`lumina`, referenced by `backend/.env`) up to migration `0004_gorgeous_maverick.sql` (`lessons_active_teacher_date_time_uidx`) by exporting and reviewing the exact 13 active duplicate test-residue rows, taking a pre-change backup, applying the user-approved non-destructive status update (cancelling only the approved duplicate test-residue rows), and confirming `npm run smoke` and `npm run e2e` pass directly against default `backend/.env` without `lumina_review` overrides.

---

## Entry Gate

- Phase 0 complete (umbrella plan, 6 phase stubs, blast-radius registry created, validators green)
- Local PostgreSQL running and reachable via `backend/.env`

---

## Blast Radius

- Local PostgreSQL database `lumina` (backup + approved targeted cleanup of duplicate active test-residue rows + `npm run db:migrate`)
- `process/context/all-context.md` (remove `lumina_review` workaround note once dev `lumina` is migrated)
- `process/context/database/booking-and-credit-integrity.md`
- `process/context/database/migrations-workflow.md`
- `process/context/tests/all-tests.md`
- `process/features/backend-cutover/backlog/booking-credit-concurrency_NOTE_18-11-26.md`

---

## Implementation Checklist

### Step A — Live Inventory & User Approval (read-only)

- [x] A1. Re-run the read-only active duplicate query on dev `lumina` (`status IN ('scheduled', 'live')` grouped by `(teacher_id, date, time)` with `COUNT(*) > 1`) and verify exact row IDs, timestamps, student/teacher names, and linked credit/request/absence rows.
- [x] A2. Present the exact rows and recommended non-destructive cleanup (`UPDATE lessons SET status = 'cancelled' ...` on the duplicate residue rows vs. keeping one row per slot) to the user and record explicit approval before touching dev `lumina`.

### Step B — Backup, Cleanup & Migration `0004`

- [x] B1. Take a `pg_dump` backup of dev `lumina` into the temp folder (`C:\Users\mckin\AppData\Local\Temp\opencode\`) and confirm non-empty dump output.
- [x] B2. Execute the user-approved targeted SQL in a single transaction on dev `lumina`, verifying exact affected row count and zero active duplicate groups remaining.
- [x] B3. Run `npm run db:migrate` against default `backend/.env` (`lumina`) and confirm `lessons_active_teacher_date_time_uidx` exists in `pg_indexes`.

### Step C — Default-DB Verification & Docs Sync

- [x] C1. Run `npm run smoke` (14 domains, 375 checks) and `npm run e2e` (23 API + 3 demo) against default `backend/.env` (no `DATABASE_URL` override) and confirm 0 active duplicate groups afterwards.
- [x] C2. Update context docs and `booking-credit-concurrency_NOTE_18-11-26.md` to record that dev `lumina` is now migrated through `0004`.

---

## Exit Gate

```powershell
# Verify index present and 0 active duplicate groups on default dev `lumina`
npm run db:migrate
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
# Expected: all commands exit 0 without any DATABASE_URL override; 0 active duplicate groups
```

- All checklist items checked
- User-approved cleanup documented with before/after row counts and backup path
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- User does not approve mutating the 13 active duplicate rows in dev `lumina`
- New unexpected active duplicate rows appear that are NOT test residue and require business-owner triage
- Local PostgreSQL service is stopped or `pg_dump` cannot produce a verified backup

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [x] 1. RESEARCH — research-agent: inspect live dev `lumina` duplicates, linked rows, and `pg_dump` availability (2 groups / 13 rows verified; 0 requests/absences/ratings; `pg_dump.exe` at `C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`)
- [x] 2. INNOVATE — innovate-agent: Decision Summary — **Option A chosen** (cancel all 13 test-residue rows by exact UUID after `pg_dump`, freeing both `06:00` slots cleanly and matching `credit-concurrency.spec.ts` `finally` cleanup; Option B keeping 2 residue rows rejected as unnecessary test clutter)
- [x] 3. PLAN-SUPPLEMENT — plan-agent: exact 13 UUIDs, `pg_dump` path, and non-destructive SQL recorded below
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written below and accepted by user ("approve option a")
- [x] 5. EXECUTE — backup (`lumina_pre_0004.dump`), Option A cleanup (13 rows cancelled, 0 deleted), `db:migrate` (`0004` applied), and static/unit checks green
- [x] 6. EVL — `npm run smoke` (14/14, 375) and `npm run e2e` (23 API + 3 demo) green on default `lumina`; 0 active duplicate groups post-run
- [x] 7. UPDATE PROCESS — phase report written, context & umbrella state updated, commit done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- Local Postgres `lumina` (`lessons` rows in duplicate groups + Drizzle migrations table)
- `process/context/all-context.md`
- `process/context/database/booking-and-credit-integrity.md`
- `process/context/database/migrations-workflow.md`
- `process/context/tests/all-tests.md`
- `process/features/backend-cutover/backlog/booking-credit-concurrency_NOTE_18-11-26.md`

---

## Public Contracts

- No API or schema contract change (applies already-committed migration `0004` to dev `lumina`).
- Historical `cancelled`/`completed` rows are preserved; no rows are deleted.

---

## Verification Evidence

```powershell
npm run db:migrate
npm run smoke
npm run e2e
# Expected: exit 0 on default backend/.env (lumina), 0 active duplicate groups post-run
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-01-dev-db-migration-0004_PLAN_23-11-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: Spawn research pass for Phase 01 RESEARCH (Step 1) — read-only inventory of dev `lumina` duplicates and `pg_dump` check.

---

## Validate Contract

- **Status:** PASS (23-11-26)
- **Gate:** PASS — user explicitly approved Option A (`approve option a`) after reviewing all 13 exact UUIDs and linked counts (`0` requests, `0` absences, `0` ratings).
- **Plan updates applied:** Recorded exact 13 UUIDs, `C:\Program Files\PostgreSQL\17\bin\pg_dump.exe` backup path (`C:\Users\mckin\AppData\Local\Temp\opencode\lumina_pre_0004.dump`), and Option A decision summary.
- **Execute-agent instructions:**
  - E1: Run `pg_dump -Fc` to `C:\Users\mckin\AppData\Local\Temp\opencode\lumina_pre_0004.dump` and verify file exists and size > 0 before any write.
  - E2: Run a single transaction updating ONLY the 13 approved UUIDs (`status = 'cancelled'`, `WHERE id = ANY(...) AND status IN ('scheduled', 'live')`); assert exactly 13 rows updated and 0 active duplicate groups remain; roll back if count !== 13.
  - E3: Never delete rows, never alter `credit_entries`, never run `db:reset` or `db:push`.
  - E4: Run `npm run db:migrate` against default `backend/.env` (`lumina`) and confirm `lessons_active_teacher_date_time_uidx` exists in `pg_indexes`.
  - E5: Run `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run smoke`, and `npm run e2e` with NO `DATABASE_URL` override; re-query active duplicates afterwards and assert `0`.
- **Test gates:**
  | Criterion | Behavior | Strategy | Proving test | Gap resolution |
  |---|---|---|---|---|
  | P1-1 | Pre-change backup verified on disk | Agent-Probe | `pg_dump -Fc` size > 0 | D |
  | P1-2 | Exactly 13 approved residue rows cancelled; 0 deleted; 0 active duplicates | Hybrid | SQL transaction `RETURNING` count = 13 + duplicate group query = 0 | B |
  | P1-3 | Migration `0004` applied to default dev `lumina` | Hybrid | `npm run db:migrate` + `pg_indexes` confirms `lessons_active_teacher_date_time_uidx` | B |
  | P1-4 | Full static, unit, smoke, and Playwright e2e pass on default `backend/.env` with 0 new active duplicates | Hybrid | `typecheck`, `lint`, backend Vitest, `npm run smoke`, `npm run e2e`, post-run duplicate query = 0 | B |
- **High-risk pack:** Applicable (DB migration / data mutation on dev DB) — satisfied by live pre-change inventory, `pg_dump` backup, transactional exact-UUID non-destructive `UPDATE`, post-migration index proof, and full default-DB smoke+e2e rerun.
- **Backlog artifacts:** Closes the dev-DB migration gap in `process/features/backend-cutover/backlog/booking-credit-concurrency_NOTE_18-11-26.md`.
- **Known gaps:** Production migration rehearsal remains deferred until hosting exists (out of v1 scope).
- **Accepted by:** User (`approve option a`, 23-11-26).

### Approved 13 Residue UUIDs (Option A)

- `2026-11-29 06:00` (8 rows): `53474a90-e774-4635-8247-f975d26561c7`, `6c8161f2-c997-45ce-b08a-067d3e66b35f`, `d052e18c-b734-44b7-adbb-6650d8cea9a2`, `ab39aaa3-bf97-41a2-84f9-8ce941d47699`, `575c541c-e3f6-4d1b-9f65-54cdc5c7b33f`, `b102d27a-2e43-49c7-918b-8db2bf5d6bec`, `d3256373-6948-4bb5-b80a-3a7012bf5c2c`, `db3d4155-eb1b-4a27-8c72-215bcc64fb6f`
- `2026-11-30 06:00` (5 rows): `f91f9747-0c2f-451b-8a37-3aab16ad7405`, `380cfff4-5603-4aec-9b78-bf23be7375f7`, `2dd8a9d7-c204-47eb-9cc9-84bb4b21b170`, `813eb0ed-ef0c-42af-b847-f5334c5453fa`, `49e4fa49-2997-41bb-b7be-a4384e14b0e0`
