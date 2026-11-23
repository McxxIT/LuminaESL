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
**Phase status:** ⏳ PLANNED
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

- [ ] A1. Re-run the read-only active duplicate query on dev `lumina` (`status IN ('scheduled', 'live')` grouped by `(teacher_id, date, time)` with `COUNT(*) > 1`) and verify exact row IDs, timestamps, student/teacher names, and linked credit/request/absence rows.
- [ ] A2. Present the exact rows and recommended non-destructive cleanup (`UPDATE lessons SET status = 'cancelled' ...` on the duplicate residue rows vs. keeping one row per slot) to the user and record explicit approval before touching dev `lumina`.

### Step B — Backup, Cleanup & Migration `0004`

- [ ] B1. Take a `pg_dump` backup of dev `lumina` into the temp folder (`C:\Users\mckin\AppData\Local\Temp\opencode\`) and confirm non-empty dump output.
- [ ] B2. Execute the user-approved targeted SQL in a single transaction on dev `lumina`, verifying exact affected row count and zero active duplicate groups remaining.
- [ ] B3. Run `npm run db:migrate` against default `backend/.env` (`lumina`) and confirm `lessons_active_teacher_date_time_uidx` exists in `pg_indexes`.

### Step C — Default-DB Verification & Docs Sync

- [ ] C1. Run `npm run smoke` (14 domains, 375 checks) and `npm run e2e` (23 API + 3 demo) against default `backend/.env` (no `DATABASE_URL` override) and confirm 0 active duplicate groups afterwards.
- [ ] C2. Update context docs and `booking-credit-concurrency_NOTE_18-11-26.md` to record that dev `lumina` is now migrated through `0004`.

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

- [ ] 1. RESEARCH — research-agent: inspect live dev `lumina` duplicates, linked rows, and `pg_dump` availability
- [ ] 2. INNOVATE — innovate-agent: compare cleanup options (cancel all 13 residue rows vs keep 1 per group) and write Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: add exact SQL/row-ID table from research into this plan (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [ ] 5. EXECUTE — backup, approved cleanup, `db:migrate`, and per-section gates green
- [ ] 6. EVL — all EVL gates green on default `lumina`; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, context & umbrella state updated, commit done

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

(placeholder — vc-validate-agent writes this section before EXECUTE)
