---
phase: phase-04-curriculum-library
date: 2026-11-24
status: COMPLETE_WITH_GAPS
feature: launch-readiness
plan: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_PLAN_23-11-26.md
---

# Phase 04 — Curriculum Library Report

**Bottom line:** The Curriculum Library is built and verified (migrations 0005 and 0006 applied to dev `lumina`,
4 new routes, 18 bootstrap keys, role UI in API and demo mode). Step F also closed a pre-existing HIGH bug found
in review: plan-attach trusted a client `storageKey`, an arbitrary file read. Every automated and hybrid gate is
green in an independent vc-tester run (#2, 24-11-26). "With gaps" means: the AC-11 visual probe ran in demo mode
only, and the review decision is `approved-with-concerns` (user, 24-11-26). The execution commit is `74639cb`.

## What Was Done

- **Schema (A):** `library_items` (one global set; `attachment_id` unique, `ON DELETE restrict`; archive-only
  `status`) and `lesson_library_items` (link table, composite PK, no `id` column). Migration `0005_zippy_thunderbolt_ross`
  (additive, hand-reviewed) and `0006_large_the_hand` (`library_items_status_check` CHECK). Both applied to dev
  `lumina`; each applies twice as a no-op.
- **Backend (B):** new `backend/src/routes/library.ts` with `POST /library`, `PATCH /library/:id` (creator or
  admin), `POST` and `DELETE /lessons/:id/library-items[/:libraryItemId]` (admin any lesson, manager team lessons;
  teachers and students cannot attach). `canAccessAttachment` gained a library block (creator/admin; manager for
  published or team-linked items; teacher and student only for items linked to their own non-cancelled lessons,
  completed included). Bootstrap `libraryItems` and `lessonLibraryItems` (16 to 18 keys), role-filtered. Activity
  actions added.
- **Frontend (C, D):** types, dual-branch `services/library.ts`, `api/library.ts`, permissions
  (`library.manage`, `library.edit`, `lesson.attachLibraryItem`), store/bootstrap parsing, empty demo seed
  (`SCHOOL_SCHEMA_VERSION` stays 3), Library tab in `ManagerCurriculum` (`ManagerLibrary`, `LibraryForms`),
  Materials dialog in `ManagerSchedule` and `ManagerStudents`, materials lists in `TeacherLessons` and
  `StudentLessons`.
- **Tests (E):** contract test (18 keys, 4 routes, anonymous 401), smoke `library` domain (170 checks), e2e
  `curriculum-library.spec.ts` (1 test) plus a demo regression test.
- **Step F (review fixes, 24-11-26):** plan-attach takes strict `{attachmentId}` of an existing upload (uploader or
  admin; request evidence 422; never inserts an `attachments` row); new `backend/src/lib/upload-path.ts`
  `resolveUploadPath` containment on download (404 on escape); manager bootstrap no longer pulls other managers'
  user rows (`createdByName` only for admin/manager); attach race retry-once-then-409; migration 0006 CHECK; strict
  status mapper; extra smoke checks; 17 new vitest cases.
- **High-risk pack:** `harness/phase-04-library/` (5 artifacts incl. `review-decision.json`);
  `validate-risk-artifacts.mjs` reports 0 failures.
- **UPDATE PROCESS:** 9 backlog notes, context docs (database, auth, uxui, tests, root), umbrella state, registry,
  Phase 05 and Phase 06 carry-in notes.

## What Was Skipped/Deferred

Each item has a backlog note in `process/features/launch-readiness/backlog/` (all `_NOTE_24-11-26.md`):

| Item | Note |
|---|---|
| Legacy `storage_key` audit (read-only run: 241 rows, 1 non-`{uuid}.{ext}` row, id `427bf672-2f44-4d2b-896c-aec66688d562`, contains `/`; no row changed, user decision needed), school-import `storageKey` provenance, `PATCH /lessons` `lessonPlanId` validation, `lesson_plans.attachment_ids` lost-update race | `lesson-plan-attach-hardening` |
| Upload write-path hardening (Windows reserved names, symlink-safe resolution, extname sanitising) | `upload-write-path-hardening` |
| `POST /requests` stores any `attachmentId` without an ownership check (verified at `requests.ts` lines 39 and 148) | `request-attachment-ownership` |
| Orphaned uploads (incl. failed library create after upload), detached plan files | `orphaned-upload-cleanup` |
| Demo library data not carried by the import (accepted D7) | `library-import-and-demo-data` |
| Vitest for `services/library.ts` guards (Phase 05 owns the runner) | `frontend-library-service-unit-tests` |
| 390px chip clipping and Remove alignment, notification navigation/category, shared upload validator, API-mode visual probe | `library-polish-followups` |
| Library bootstrap size/pagination, manager unarchive of admin-archived item (policy), no AV/content sniffing, creator names visible to managers (accepted) | `library-bootstrap-scale-and-policy` |
| One e2e webServer 240 s startup timeout (not reproduced) | `e2e-startup-timeout-flake` |

## Test Gate Outcomes

Independent vc-tester EVL #2 (24-11-26, after Step F), default `backend/.env`:

| Gate | Command | Result |
|---|---|---|
| Migration | `npm run db:migrate` | PASS — no-op (0005, 0006 applied); 0005 file hash unchanged |
| Static | `npm run typecheck`; `npm run lint`; `git diff --check` | PASS |
| Backend unit | `npm run test --workspace @lumina/backend` | PASS — 7 files, 61 tests (was 6 / 43) |
| Smoke | `npm run smoke` | PASS — 16 domains, 656 checks (uploads 61, library 170, credits 68, auth 58) |
| Parity | `npm run e2e` | PASS — 27 API + 4 demo |
| Risk pack | `validate-risk-artifacts.mjs …/harness/phase-04-library` | PASS — 0 failures, 0 warnings |
| AC-11 | visual probe, demo mode, desktop and 390px | DONE with two cosmetic notes; API-mode probe NOT RUN |
| Phase 02/03 regression | smoke `uploads`, `credits`, `auth`; e2e `uploads`, `auth`, `booking`, `cancellation-refund`, `credit-concurrency` | PASS (same runs) |

EVL #1 (before Step F) was also green (vitest 44, smoke 16/594, e2e 27+4). `results.tsv` rows 3-6 record the loop;
row 6 is `HALTED_SUCCESS`. The one reported e2e startup timeout was in an execute-agent run; the rerun passed.

## Plan Deviations

1. **Teacher attach removed (user override, 24-11-26):** INNOVATE proposed teacher attach; the user decided only
   admin and managers attach. Plan text updated in PLAN-SUPPLEMENT before PVL.
2. **Step F added after the first EVL:** the code review found the pre-existing plan-attach file read, manager
   user-row exposure, an attach race 500, a missing status CHECK, and smoke gaps; the user chose to fix before
   committing. Step F ran its own PVL supplement (Gate PASS on retry; the first validate attempt stalled with no
   output) and its own EVL. Migration 0006 and the plan-attach contract change are the consequences.
3. **Plan-attach contract changed** from `{id,name,type,size,storageKey}` to `{attachmentId}`; callers
   (`services/curriculum.ts`, `services/uploads.ts`) were updated in the same phase.
4. **Execute for Step F was interrupted by a usage limit and resumed;** gates were re-run in full afterward.
5. Plan-structure advisory: `validate-plan-artifact.mjs` prints generic FAILs that do not apply to phase stubs
   (same family as Phases 02 and 03); `validate-phase-stub.mjs` reports 0 failures.

## Test Infra Gaps Found

- AC-11 API-mode visual probe (and Phase 03 P3-13) not run; no browser tool was available to the agents.
- No frontend unit runner, so the local-branch library service guards are proven only through the demo e2e UI
  negatives (carried to Phase 05).
- Smoke proves the canary for one escaping key over HTTP, not every hostile key; symlinks, junctions, and Windows
  reserved names are not covered by the pure-path unit tests.
- One e2e webServer 240 s startup timeout, not reproduced.

## SPEC Achievement

The inner loop is governed by the umbrella SPEC; acceptance criteria are the plan's AC-1..AC-18s.

- **Met (Fully-Automated or Hybrid gate passed in the executor run and in independent EVL #2):** AC-1 to AC-10
  and AC-12 to AC-18s (schema and migration, routes and scope, attach/detach rules, bootstrap filtering, canAccess
  matrix, containment, creator exposure, race safety, CHECK, plan-block coexistence, regression, static).
- **Unmet (residual, not a developed-behavior gate):** AC-11 visual probe in API mode (only the demo-mode probe
  ran). Backlog stub: `library-polish-followups_NOTE_24-11-26.md`.

## SPEC Gaps

AC-11 (API-mode visual probe). Declared known gaps with notes: request attachment ownership, plan-attach and
legacy-row audit, orphaned uploads, library import, frontend service unit tests.

## Closeout Packet

1. Selected plan: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-04-curriculum-library_PLAN_23-11-26.md`
2. Classification: **Ready for UPDATE PROCESS archival** at the phase level (phase VERIFIED with gaps). The program
   folder stays in `active/` because Phases 05 and 06 remain; the Phase 04 plan and report stay inside it.
3. Finished: Steps A-F; Phase Loop steps 1-7 ticked.
4. Verified: all automated and hybrid gates, executor runs plus two independent EVL runs; two vc-code-reviewer
   passes (final: approved-with-concerns, user decision). Unverified: API-mode visual probe; historical
   `storage_key` rows beyond the read-only count; no production-scale load.
4b. Validate-contract: present inline in the plan (`generated-by: inner-pvl: phase-04`), Gate: PASS; Step F
   supplement Gate: PASS.
5. Cleanup done: report, plan, umbrella state, registry, risk pack, 9 backlog notes, root/database/auth/uxui/tests
   context. Still needed: none for this phase; process commit follows this report.
6. Next valid state: Phase 05 Step 1 RESEARCH (`phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md`).
7. Commit checkpoint: execution commit `74639cb` done (40 files); process commit after UPDATE PROCESS.
8. Regression status: Phase 02 uploads and Phase 03 auth proving tests re-run in the same smoke/e2e runs, PASS.
9. SPEC achievement: see above (AC-1..10, 12..18s met; AC-11 API-mode probe unmet).

Drift score: HIGH (5 signals: more than 10 files touched; process/ folder structural change with 9 new backlog
notes; 3+ memory-worthy findings; validate-contract deviation (Step F supplement); the plan-attach contract change).
No harness or protocol files touched.
Strongly recommend UPDATE PROCESS -- harness/protocol files touched. (Drift band HIGH by count; here the signals
are product and process files, not harness files; UPDATE PROCESS is this session.)

Follow-up stubs: 9 new backlog notes (see above); no code stubs. CONTEXT_PARTIAL: none.
`vc-audit-context` run: `validate-context-discovery.mjs` reports one pre-existing environment failure
(`.agents/skills` symlink does not resolve to `.claude/skills` on this Windows checkout); `validate-all-context.mjs`
and `validate-plan-inventory.mjs` clean.

## Forward Preview

### Test Infra Found
- Backend vitest 7 files / 61 tests (new `upload-path.test.ts`, 17 tests; contract test 9). Smoke 16 domains / 656
  checks (`library` domain added, archives its own items). e2e 27 API + 4 demo.

### Blast Radius Changes
- New: `backend/src/routes/library.ts`, `backend/src/lib/upload-path.ts`, `backend/tests/upload-path.test.ts`,
  migrations `0005`, `0006`, `ManagerLibrary.tsx`, `LibraryForms.tsx`, `services/library.ts`, `api/library.ts`,
  `frontend/e2e/api/curriculum-library.spec.ts`.
- Beyond the original plan (Step F): `backend/src/routes/{courses,uploads}.ts`, `school.ts` bootstrap mapper.
- Phase 05 shares `StudentLessons.tsx`, `TeacherLessons.tsx`, `backend/scripts/smoke.ts`,
  `frontend/e2e/demo/regression.spec.ts`; Phase 06 shares `smoke.ts`. Next migration number is `0007`.

### Commands to Stay Green
`npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` (>= 61), `npm run smoke` (>= 656
checks, 16 domains), `npm run e2e` (27 + 4), `git diff --check`, `git status --porcelain -- backend/src/db` after
any non-migration phase.

### Dependency Changes
None (no new packages).
