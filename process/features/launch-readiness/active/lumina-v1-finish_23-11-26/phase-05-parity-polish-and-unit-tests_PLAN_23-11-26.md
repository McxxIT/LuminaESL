---
name: plan:lumina-v1-finish-phase-05-parity-polish-and-unit-tests
description: "Lumina ESL v1 Finish — Phase 05: Rebook enrichment, 'credits' UI copy, 390px mobile tab fixes, and frontend Vitest service unit tests"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-05
---

# Phase 05 — Parity Polish & Frontend Unit Tests

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_REPORT_23-11-26.md (flat in the program task folder)

---

## Purpose

Retire the remaining parity, UI-polish, and test-coverage backlog items before final CI/Docker packaging:
1. Align `POST /lessons/:id/rebook` with `resolveLessonDefaults` (fresh room code + next lesson plan, or explicit documented semantics — closing `rebook-enrichment_NOTE_18-11-26.md`).
2. Replace visible `"credit hours"` / `"hrs"` labels with `"credits"` / `"lessons"` across student, manager, and admin UI without breaking the backend `hours` field (`credit-hours-wording_NOTE_18-11-26.md`).
3. Fix the remaining 390px mobile tab-row overflows on Curriculum, Lessons, and Teacher Lessons (`frontend/PROGRESS.md` item 5).
4. Add **Vitest** to `@lumina/frontend` with fast unit tests over the local-branch school services (bookings, approvals, credits, homework, quality, library) using `createMemoryAdapter` (`frontend-test-runner_NOTE_18-11-26.md`).

---

## Entry Gate

- Phase 04 complete (Curriculum Library landed and verified so copy polish and frontend unit tests cover all v1 domains)

---

## Blast Radius

- `backend/src/routes/lessons.ts` (`POST /lessons/:id/rebook`)
- `backend/scripts/smoke.ts` (`rebook` assertions)
- `frontend/package.json`, `package.json` (root `npm run test` runs both workspaces)
- `frontend/vitest.config.ts` (new)
- `frontend/tests/school-services.test.ts` (new, plus focused domain test files as needed)
- `frontend/app/lib/data.ts`, `frontend/app/globals.css`, role UI components carrying `"credit hours"` / `"hrs"` labels or 390px overflowing tab rows

---

## Implementation Checklist

### Step A — Rebook Enrichment & Smoke Assertion

- [ ] A1. Update `POST /lessons/:id/rebook` to resolve the next lesson plan and fresh `ESL-####` room code via `resolveLessonDefaults` (keeping existing collision guard and debit behavior intact).
- [ ] A2. Add assertions in `backend/scripts/smoke.ts` (`rebook` domain) verifying fresh room code and plan progression.

### Step B — UI Copy ("credits") & 390px Mobile Tab Overflow Fixes

- [ ] B1. Audit and update visible `"credit hours"` / `"hrs"` copy to `"credits"` / `"lessons"` across student, manager, and admin components (keeping DB/API `hours` field names untouched so public contracts do not break).
- [ ] B2. Fix 390px horizontal tab-row overflow on Curriculum, Student Lessons, and Teacher Lessons in `frontend/app/globals.css` / tab bar markup; verify no Playwright selector regressions.

### Step C — Frontend Vitest Unit Runner

- [ ] C1. Install/configure Vitest in `frontend/` (`vitest.config.ts`, `test` script in `frontend/package.json`, and wire root `npm run test` to run both backend and frontend tests).
- [ ] C2. Write committed service-boundary unit tests over `createMemoryAdapter` covering bookings, cancellations/refunds, approvals, credits, homework, quality ratings, and Curriculum Library local rules.

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test
npm run smoke
npm run e2e
git diff --check
# Expected: root `npm run test` passes BOTH @lumina/backend and @lumina/frontend Vitest suites; smoke & e2e green
```

- All checklist items checked
- Regression check confirms Phases 01–04 surfaces (collision, upload scope, auth, library) remain green
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Phase 04 exit gate not yet passed
- Copy changes break Playwright text/role selectors without matching spec updates (audit all `frontend/e2e/**` selectors during RESEARCH)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: inspect `rebook` handler, grep all `"credit hours"` / `"hrs"` strings & e2e selectors, check 390px tab CSS, and check `createMemoryAdapter` + workspace Vitest setup
- [ ] 2. INNOVATE — innovate-agent: confirm rebook plan/room-code rule, exact copy table, and Vitest test layout; write Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: refine exact file touchpoints from research (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [ ] 5. EXECUTE — implement Steps A–C with per-section gates green
- [ ] 6. EVL — all EVL gates + Phases 01–04 regression checks green; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, backlog notes closed (`rebook-enrichment`, `credit-hours-wording`, `frontend-test-runner`), context & umbrella state updated, commits done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/routes/lessons.ts`, `backend/scripts/smoke.ts`
- `package.json`, `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/tests/*`
- `frontend/app/globals.css`, `frontend/app/lib/data.ts`, affected role components, `frontend/e2e/*` (if any copy-matched selector needs updating)

---

## Public Contracts

- Backend/API JSON field `hours` stays unchanged (UI copy change only).
- `POST /lessons/:id/rebook` returns the newly resolved lesson plan and fresh `ESL-####` room code (same JSON shape).

---

## Verification Evidence

```powershell
npm run typecheck
npm run lint
npm run test
npm run smoke
npm run e2e
# Expected: exit 0
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: Wait for Phase 04 exit gate, then start Phase 05 RESEARCH (Step 1).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
