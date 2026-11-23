---
name: plan:lumina-v1-finish-phase-02-security-and-credits-policy
description: "Lumina ESL v1 Finish — Phase 02: Per-record upload download authorization and staff-managed credits policy in API mode"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-02
---

# Phase 02 — Security & Staff-Managed Credits

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_REPORT_23-11-26.md (flat in the program task folder)

---

## Purpose

Close the two highest-priority backend security and billing integrity gaps before adding new features:
1. Enforce per-record authorization on `GET /uploads/:id` and `GET /uploads/:id/download` so an authenticated user cannot read metadata or bytes of attachments belonging to another team, course, request, or lesson (`attachment-access-scope_NOTE_18-11-26.md`).
2. Enforce the approved staff-managed credits policy in API mode: disable student self-purchase on `POST /credits` (returning `403` for students in API mode while admins and team-scoped managers continue to add/adjust credits) and replace the student self-purchase action in `StudentBilling.tsx` in API mode with clear staff-managed messaging, keeping demo mode untouched (`booking-rules-followups_NOTE_18-11-26.md` item 3).

---

## Entry Gate

- Phase 01 complete (dev `lumina` migrated through `0004`, `npm run smoke` and `npm run e2e` green on default `backend/.env`)

---

## Blast Radius

- `backend/src/routes/uploads.ts`
- `backend/src/routes/credits.ts`
- `backend/src/lib/scope.ts`
- `backend/tests/contract.test.ts`
- `backend/scripts/smoke.ts`
- `frontend/app/components/student/StudentBilling.tsx`
- `frontend/app/lib/school/services/credits.ts`
- `frontend/e2e/api/uploads.spec.ts`
- `frontend/e2e/api/cancellation-refund.spec.ts`
- `frontend/e2e/demo/regression.spec.ts`

---

## Implementation Checklist

### Step A — Attachment Access Scope (`GET /uploads/:id{,/download}`)

- [ ] A1. Define and implement a shared `canAccessAttachment(db, user, attachment)` helper in `backend/src/lib/scope.ts` covering: admin (all), uploader (own upload), lesson-plan attachments (course visibility / enrolled student / teaching teacher / owning or published course manager), and request cancellation evidence (requesting teacher / owning manager / admin).
- [ ] A2. Enforce `canAccessAttachment` in both `GET /uploads/:id` and `GET /uploads/:id/download` (`403 FORBIDDEN` when outside actor scope, `404` when missing).
- [ ] A3. Add negative (403 cross-team/cross-role) and positive (200 byte-identical) assertions to `backend/scripts/smoke.ts` (`uploads` domain) and `frontend/e2e/api/uploads.spec.ts`.

### Step B — Staff-Managed Credits Policy (API Mode)

- [ ] B1. Restrict `POST /credits` in `backend/src/routes/credits.ts` so students receive `403 FORBIDDEN` (cannot self-purchase), while admin and team-scoped managers retain full credit top-up/adjustment capability under `lockStudentCredits`.
- [ ] B2. Update `frontend/app/lib/school/services/credits.ts` and `frontend/app/components/student/StudentBilling.tsx` so API mode hides/disables student self-purchase and shows clear "Contact your school manager to add credits" guidance, while demo mode retains local package purchase for offline exploration.
- [ ] B3. Update `backend/scripts/smoke.ts` (`credits` domain) and `backend/tests/contract.test.ts` to assert student `POST /credits` returns `403`, and verify `frontend/e2e` API + demo suites pass.

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
# Expected: all exit 0; smoke proves upload 403 cross-scope + student POST /credits 403; e2e API + demo green
```

- All checklist items checked
- Regression check confirms existing booking, cancellation-refund, and demo upload/billing flows remain green
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Phase 01 exit gate not yet passed
- Unreferenced/orphaned attachment rows exist whose ownership cannot be resolved cleanly (must document fallback rule for newly uploaded pre-attach files)
- Smoke or e2e test depends on student self-purchase instead of admin/manager credit setup (must be identified during RESEARCH)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: map every attachment creation/reference path (`attachments`, `lesson_plans`, `requests`, `school-import`) and every student credit-purchase caller
- [ ] 2. INNOVATE — innovate-agent: finalize exact ownership matrix per role & attachment kind + pre-attach upload window handling; write Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: supplement checklist with exact edge cases found in research (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [ ] 5. EXECUTE — implement Step A & Step B with per-section gates green
- [ ] 6. EVL — all EVL gates + Phase 01 regression checks green; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, backlog notes closed/updated, context & umbrella state updated, commits done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/routes/uploads.ts`
- `backend/src/routes/credits.ts`
- `backend/src/lib/scope.ts`
- `backend/scripts/smoke.ts`
- `backend/tests/contract.test.ts`
- `frontend/app/components/student/StudentBilling.tsx`
- `frontend/app/lib/school/services/credits.ts`
- `frontend/e2e/api/uploads.spec.ts`
- `frontend/e2e/api/cancellation-refund.spec.ts`

---

## Public Contracts

- `GET /uploads/:id` and `GET /uploads/:id/download`: authorized actors receive existing 200 payload/bytes; unauthorized authenticated actors now receive `403 FORBIDDEN`.
- `POST /credits`: admin and team-scoped manager behavior unchanged; student self-purchase now returns `403 FORBIDDEN` in API mode.
- Demo mode retains offline local credit packages and IndexedDB attachment downloads.

---

## Verification Evidence

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
# Expected: exit 0; new 403 upload-scope and student-credit-purchase assertions pass
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_PLAN_23-11-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: Wait for Phase 01 exit gate, then start Phase 02 RESEARCH (Step 1).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
