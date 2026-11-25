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
**Phase status:** ✅ VERIFIED
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

- [x] A1. Define and implement a shared `canAccessAttachment(db, user, attachment)` helper in `backend/src/lib/scope.ts` covering: admin (all), uploader (own upload), lesson-plan attachments (course visibility / enrolled student / teaching teacher / owning or published course manager), and request cancellation evidence (requesting teacher / owning manager / admin).
- [x] A2. Enforce `canAccessAttachment` in both `GET /uploads/:id` and `GET /uploads/:id/download` (`403 FORBIDDEN` when outside actor scope, `404` when missing).
- [x] A3. Add negative (403 cross-team/cross-role) and positive (200 byte-identical) assertions to `backend/scripts/smoke.ts` (`uploads` domain) and `frontend/e2e/api/uploads.spec.ts`.

### Step B — Staff-Managed Credits Policy (API Mode)

- [x] B1. Restrict `POST /credits` in `backend/src/routes/credits.ts` so students receive `403 FORBIDDEN` (cannot self-purchase), while admin and team-scoped managers retain full credit top-up/adjustment capability under `lockStudentCredits`.
- [x] B2. Update `frontend/app/lib/school/services/credits.ts` and `frontend/app/components/student/StudentBilling.tsx` so API mode hides/disables student self-purchase and shows clear "Contact your school manager to add credits" guidance, while demo mode retains local package purchase for offline exploration.
- [x] B3. Update `backend/scripts/smoke.ts` (`credits` domain) and `backend/tests/contract.test.ts` to assert student `POST /credits` returns `403`, and verify `frontend/e2e` API + demo suites pass.

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

- [x] 1. RESEARCH — research-agent: mapped all attachment references (`lesson_plans.attachment_ids`, `requests.attachment_id`, `attachments.uploaded_by`) in `school.ts`/`uploads.ts` and all `POST /credits` / `purchaseCredits` callers across backend, frontend, smoke, and e2e
- [x] 2. INNOVATE — innovate-agent: Decision Summary — `canAccessAttachment` in `backend/src/lib/scope.ts` mirrors `school.ts` bootstrap 1:1 plus uploader pre-attach access (rejected signed URLs as unnecessary over authenticated `requestBlob`); `POST /credits` restricted to `["admin", "manager"]`, API-mode `StudentBilling.tsx` hides self-purchase & fake VISA/auto-renew card while keeping demo mode intact
- [x] 3. PLAN-SUPPLEMENT — plan-agent: exact ownership rules, smoke matrix, and e2e checks recorded in Validate Contract below
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written below and accepted by user (`ENTER EXECUTE MODE`)
- [x] 5. EXECUTE — implement Step A & Step B with per-section gates green
- [x] 6. EVL — all EVL gates + Phase 01 regression checks green; EVL HANDOFF SUMMARY written
- [x] 7. UPDATE PROCESS — phase report written, backlog notes closed/updated, context & umbrella state updated, commits done

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
- Last completed step: 7 (UPDATE PROCESS) — phase verified and closed out
- Validate-contract status: PASS (accepted 23-11-26)
- Next step: Phase 03 — Auth & Account Lifecycle Hardening; start at RESEARCH.
- Report: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-02-security-and-credits-policy_REPORT_23-11-26.md`

---

## Validate Contract

- **Status:** PASS (23-11-26)
- **Gate:** PASS — security/auth and billing blast radius reviewed; all touchpoints verified; no schema migration required; demo mode strictly fenced.
- **Plan updates applied:** Locked `canAccessAttachment` ownership rules to match `backend/src/routes/school.ts` bootstrap 1:1 plus uploader pre-attach access; confirmed zero existing Playwright tests rely on student `POST /credits`; aligned `StudentBilling.tsx` API-mode UI to hide fake VISA/auto-renew demo card as well as Buy credits buttons.
- **Execute-agent instructions:**
  - E1: Implement `canAccessAttachment(db, actor, attachment)` and `assertCanAccessAttachment(db, actor, attachment)` in `backend/src/lib/scope.ts`, covering admin, uploader (`attachment.uploadedBy === actor.sub`), `requests.attachmentId`, and `lesson_plans.attachmentIds` (matching `school.ts` visibility for manager/teacher/student). Unreferenced uploads by other users return `403 FORBIDDEN`.
  - E2: Call `assertCanAccessAttachment` in both `GET /uploads/:id` and `GET /uploads/:id/download` in `backend/src/routes/uploads.ts` after confirming the attachment exists (`404` when missing, `403` when forbidden).
  - E3: Restrict `POST /credits` in `backend/src/routes/credits.ts` to `app.requireRole(["admin", "manager"])`; preserve admin/team-scoped manager credit additions, adjustments, 100-credit cap, `lockStudentCredits`, and activity logging.
  - E4: Update `frontend/app/lib/school/services/credits.ts` (API mode fails fast with `ServiceError`) and `frontend/app/components/student/StudentBilling.tsx` (in `isApiDataMode()`, hide Buy credits controls, purchase modal, and demo VISA/auto-renew card; render school-managed credits panel while preserving real balance, history table, and invoice download; keep demo mode untouched).
  - E5: Update `backend/scripts/smoke.ts` (`uploads` scope matrix + `credits` student 403) and `frontend/e2e/api/uploads.spec.ts` (cross-scope 403 + student `POST /credits` 403 + API-mode Student Billing UI check).
  - E6: Run `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run smoke`, and `npm run e2e` (API + demo) to green before committing execution changes separately from process updates.
- **Test gates:**
  | Criterion | Behavior | Strategy | Proving test | Gap resolution |
  |---|---|---|---|---|
  | P2-1 | Unauthorized authenticated user gets `403` on `GET /uploads/:id` and `/download` (pre-attach, draft course, unrelated course, cross-team request evidence) | Hybrid | `npm run smoke` (`uploads` scope matrix) + `frontend/e2e/api/uploads.spec.ts` | B |
  | P2-2 | Authorized roles (admin, uploader, enrolled student/teacher, owning/published manager, team manager on request) still download byte-identical files (`200`) | Hybrid | `npm run smoke` (`uploads`) + `frontend/e2e/api/uploads.spec.ts` + `cancellation-refund.spec.ts` | B |
  | P2-3 | Student `POST /credits` returns `403` in API mode (balance & activity unchanged); admin/team-manager credits and 100-credit cap remain intact | Hybrid | `npm run smoke` (`credits`) + `frontend/e2e/api/uploads.spec.ts` | B |
  | P2-4 | API-mode `StudentBilling` hides `"Buy credits"` and demo VISA card; demo mode retains offline billing & IndexedDB downloads with zero `/api/v1/` calls | Hybrid | `frontend/e2e/api/uploads.spec.ts` + `frontend/e2e/demo/regression.spec.ts` | B |
  | P2-5 | Static typecheck, lint, backend Vitest, and Phase 01 regression (0 active duplicate groups) stay green | Fully-Automated | `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` | A |
- **High-risk pack:** Applicable (auth/access-control + billing/credits) — satisfied by positive+negative role matrix across all 4 roles in live `smoke` and Playwright API/demo specs.
- **Backlog artifacts:** Closes `process/features/backend-cutover/backlog/attachment-access-scope_NOTE_18-11-26.md` and `booking-rules-followups_NOTE_18-11-26.md` item 3.
- **Known gaps:** Phase 04 (Curriculum Library) will extend `canAccessAttachment` when library item attachments are introduced.
- **Accepted by:** User (`ENTER EXECUTE MODE`, 23-11-26).
