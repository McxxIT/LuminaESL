---
name: plan:lumina-v1-finish-phase-04-curriculum-library
description: "Lumina ESL v1 Finish — Phase 04: Planned Curriculum Library (reusable materials, teacher attachment to lessons, student/parent view & download)"
date: 23-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: phase-04
---

# Phase 04 — Curriculum Library

**Program:** lumina-v1-finish
**Umbrella plan:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_REPORT_23-11-26.md (flat in the program task folder)

---

## Purpose

Build the planned **Curriculum Library** end-to-end across PostgreSQL, Fastify API, and both API and demo frontend modes:
- Admins (and optionally managers, finalized in INNOVATE) upload and organize reusable shared teaching materials (title, category/level, description, tags, attached file via `POST /uploads`).
- Teachers browse published library materials and attach/detach them to scheduled/upcoming lessons (in addition to or alongside the course lesson plan).
- Students (and parents acting through the student account) view and download library materials attached to their lessons, enforced through Phase 02's scoped `GET /uploads/:id/download` rules.

---

## Entry Gate

- Phase 02 complete (scoped `GET /uploads/:id{,/download}` is live so library downloads reuse the same authorization layer)
- Phase 03 complete (sequential program order; auth lifecycle verified)

---

## Blast Radius

- `backend/src/db/schema.ts` + generated Drizzle migration `0005_*.sql` + `meta/_journal.json` + snapshot
- `backend/src/routes/library.ts` (new) + `backend/src/routes/index.ts`
- `backend/src/routes/lessons.ts`, `backend/src/routes/school.ts`, `backend/src/routes/uploads.ts`, `backend/src/lib/scope.ts`, `backend/src/lib/activity.ts`
- `backend/tests/contract.test.ts`, `backend/scripts/smoke.ts`
- `frontend/app/lib/school/{types,store,seed,migrate,views,index}.ts`
- `frontend/app/lib/school/api/library.ts` (new), `frontend/app/lib/school/services/library.ts` (new)
- `frontend/app/components/manager/ManagerCurriculum.tsx` (Library tab/view)
- `frontend/app/components/teacher/TeacherLessons.tsx` (attach/view library items on lesson)
- `frontend/app/components/student/StudentLessons.tsx` (view/download attached library items)
- `frontend/e2e/api/curriculum-library.spec.ts` (new) + `frontend/e2e/demo/regression.spec.ts`

---

## Implementation Checklist

### Step A — Schema, Migration & Shared Contract

- [ ] A1. Add `library_items` (and join table `lesson_library_items` or normalized link column, finalized in INNOVATE) to `backend/src/db/schema.ts` and generate migration `0005_*.sql` via `npm run db:generate`.
- [ ] A2. Review generated SQL and apply via `npm run db:migrate`; expose library collections/links in `GET /school/bootstrap` (`backend/src/routes/school.ts`), update `frontend/app/lib/school/types.ts` (bump `SCHOOL_SCHEMA_VERSION` if needed), and update `backend/tests/contract.test.ts`.

### Step B — Backend API, Scope & Activity

- [ ] B1. Implement `backend/src/routes/library.ts` (list, create, update, archive/delete with reference guard) and teacher/manager/admin attach/detach on lessons (`backend/src/routes/lessons.ts`) with activity logging.
- [ ] B2. Extend `canAccessAttachment` in `backend/src/lib/scope.ts` so library item attachments are downloadable by admins, managers, teachers, and students whose lessons include that library item (403 for unrelated students).

### Step C — Frontend UI (API + Demo Parity) & Tests

- [ ] C1. Add dual-branch `services/library.ts` + `api/library.ts` + demo seed/upgrade support (strictly keeping demo seed fenced out of API mode).
- [ ] C2. Add Library management UI under Manager/Admin Curriculum, teacher attach/view controls in `TeacherLessons.tsx`, and student/parent view & download in `StudentLessons.tsx`.
- [ ] C3. Add `library` domain to `backend/scripts/smoke.ts` and new Playwright spec `frontend/e2e/api/curriculum-library.spec.ts` (upload -> attach -> student download byte-identical -> unrelated student 403), plus demo-mode verification.

---

## Exit Gate

```powershell
npm run db:migrate
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
git diff --check
# Expected: all exit 0; new library smoke domain & curriculum-library.spec.ts pass; contract test green
```

- All checklist items checked
- Regression check confirms Phase 02 upload scoping & existing curriculum/lesson flows remain green
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Phase 02 or Phase 03 exit gate not yet passed
- Schema/bootstrap key mismatch breaks `backend/tests/contract.test.ts` or `POST /school/import` compatibility (must verify import compatibility during RESEARCH)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: inspect `ManagerCurriculum`, `TeacherLessons`, `StudentLessons`, `school.ts`, `school-import.ts`, `uploads.ts`, and `schema.ts`
- [ ] 2. INNOVATE — innovate-agent: decide table shape (`library_items` + join table), ownership/visibility rules (admin vs manager), and schema-version/import impact; write Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: add exact schema, routes, and UI details to this plan (or mark "n/a — research clean")
- [ ] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
- [ ] 5. EXECUTE — implement Steps A–C with per-section gates green
- [ ] 6. EVL — all EVL gates + Phase 02/03 regression checks green; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, curriculum/database/uxui context docs & umbrella state updated, commits done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `backend/src/db/{schema.ts,migrations/0005_*.sql,migrations/meta/*}`
- `backend/src/routes/{library,index,lessons,school,uploads}.ts`, `backend/src/lib/{scope,activity}.ts`
- `backend/tests/contract.test.ts`, `backend/scripts/smoke.ts`
- `frontend/app/lib/school/{types,store,seed,migrate,views,index,api/library,services/library}.ts`
- `frontend/app/components/{manager/ManagerCurriculum,teacher/TeacherLessons,student/StudentLessons}.tsx`
- `frontend/e2e/api/curriculum-library.spec.ts`

---

## Public Contracts

- New endpoints under `/api/v1/library` and lesson attachment link routes.
- `GET /api/v1/school/bootstrap` gains library collection(s) synced with `frontend/app/lib/school/types.ts` and `backend/tests/contract.test.ts`.
- Existing lesson-plan attachments and course curriculum routes remain backward-compatible.

---

## Verification Evidence

```powershell
npm run db:migrate
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run smoke
npm run e2e
# Expected: exit 0
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_PLAN_23-11-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: Wait for Phase 03 exit gate, then start Phase 04 RESEARCH (Step 1).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
