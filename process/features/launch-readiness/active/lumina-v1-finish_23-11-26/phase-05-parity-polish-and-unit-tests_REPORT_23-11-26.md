---
phase: phase-05-parity-polish-and-unit-tests
date: 2026-11-25
status: COMPLETE
feature: launch-readiness
plan: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md
---

# Phase 05 — Parity Polish and Unit Tests Report

**Bottom line:** Rebook now works for any non-live lesson and behaves like a fresh booking, the UI says "credits"
instead of hours where it means credits, the 390px material-chip overflow is fixed, and the frontend has a Vitest
runner with 54 tests. Every gate was green first try in an independent vc-tester run (25-11-26), the code review
found 0 Critical, High or Medium issues, and the user approved. The execution commit is `5c1b4b9` (31 files, not
pushed). The API-mode visual probe and Phase 03 P3-13, both carried in as open gaps, passed.

## What Was Done

- **Rebook (`backend/src/routes/lessons.ts`):** `POST /lessons/:id/rebook` accepts any non-live original (live
  returns 400). Inside the existing transaction it keeps the lock order (`lockStudentCredits`, slot lookup, balance,
  `resolveLessonDefaults`, insert, slot delete, one debit, activity) and gives the new lesson the next lesson plan,
  a fresh `ESL-####` room code and `planAttachedBy`/`planAttachedAt`. Title and focus are kept; exactly one credit
  is debited. The local (demo) `rebookLesson` gained the same live refusal (`services/bookings.ts`, one line).
- **Credits wording:** 28 visible strings now read "credits" / "1 credit" / "Lesson credits" / "credit packages" /
  "Credits:" (`StudentBilling`, `PeopleForms`, `ManagerStudents`, `ManagerSchedule`, `StudentLessons`,
  `StudentOverview`, `LuminaApp`, `lib/data.ts`, `notifications.ts`, `services/people.ts`). Genuine hours are
  unchanged. `credit-copy.test.ts` guards the file list.
- **390px polish:** measured first. Tab rows did not overflow (the tab bars scroll internally); the real defect
  was a 494px material chip in a 390px viewport. Fixed in `globals.css`: `.lesson-material-files` grid
  `minmax(0,1fr)` with `min-width:0` and the compact-button indent reset at 480px and below.
- **Shared upload validator:** `validateUploadFile` and `ACCEPTED` in `lib/school/files.ts`, used by
  `services/uploads.ts` and `services/library.ts` (messages byte-identical); library notifications now navigate.
- **Frontend Vitest:** `frontend/vitest.config.ts` (node env, `@` alias), `vitest 3.2.7` devDependency, 10 files /
  54 tests under `frontend/tests/` plus `helpers/{school,fixtures}.ts` driving the real local services on a memory
  store: credits, bookings and rebook, approvals, homework, quality, notifications, permissions, library guards,
  upload validation, credit-copy guard. `package-lock.json` changed by the vitest line only.
- **Smoke:** `rebookScenario` extended (rebook domain 64 checks; suite 705 checks, was 656).
- **Visual probe:** API-mode probe at 390px passed for the Library tab, Materials dialog and Phase 03 P3-13
  (password-change card, admin reset modal). Screenshots are in the session scratchpad, not committed.
- **High-risk pack:** `harness/phase-05-rebook/` (risk-gate, context-snippets, adversarial-validation,
  verification incl. EVL section, review-decision). `validate-risk-artifacts.mjs`: 0 failures, 0 warnings.
- **UPDATE PROCESS:** this report, backlog notes (3 resolved in backend-cutover, 2 resolved/renamed and 2 updated
  in launch-readiness, 1 new), context docs, umbrella state, registry, plan ticks.

## What Was Skipped/Deferred

| Item | Where |
|---|---|
| `createLibraryItem` local happy path unit test (needs FileReader/IndexedDB) | `frontend-library-create-item-unit-test_NOTE_25-11-26.md` |
| Review residuals: live-status TOCTOU (accepted), API rebook of a scheduled original (matches decision), smoke room-code flake (1/9000), `vi.unstubAllEnvs` in a test body, vitest specifier 3.2.7 vs `^3.0.5`, fixed copy-guard file list, smoke rebook 409 and other-student 403 cases | `phase-05-review-residuals_NOTE_25-11-26.md` |
| e2e webServer startup timeout flake (not seen in Phase 05) | stays open, Phase 06 (`e2e-startup-timeout-flake_NOTE_24-11-26.md`) |
| Default-account-password fix (HIGH) | user decision 24-11-26: own RIPER-5 pass after Phase 05, before Phase 06; note marked OPEN, NEXT |
| Null-enrollment rebook not exercised in smoke | documented in a handler comment; behaves like `POST /lessons` |

## Test Gate Outcomes

Independent vc-tester EVL (25-11-26, default `backend/.env`), all first try:

| Gate | Command | Result |
|---|---|---|
| Static | `npm run typecheck`; `npm run lint`; `git diff --check` | PASS |
| Backend unit | `npm run test --workspace @lumina/backend` | PASS — 7 files, 61 tests |
| Frontend unit | `npm run test --workspace @lumina/frontend`; root `npm run test` | PASS — 10 files, 54 tests |
| Smoke | `npm run smoke` | PASS — 16 domains, 705 checks (rebook 64) |
| Parity | `npm run e2e` | PASS — 27 API + 4 demo, no startup timeout |
| DB untouched | `git status --porcelain -- backend/src/db` | PASS — empty (no migration) |
| Lockfile | `git diff package-lock.json` | PASS — only the vitest line |
| Clean install | `npm ci`, then typecheck and frontend tests | PASS |
| Risk pack | `validate-risk-artifacts.mjs …/harness/phase-05-rebook` | PASS — 0 failures, 0 warnings |
| Phase 01-04 regression | smoke `library`, `uploads`, `credits`, `auth`; e2e `curriculum-library`, `uploads`, `credit-concurrency` | PASS (same runs) |

`results.tsv` rows 7-9: PVL first-pass PASS, EVL baseline, EVL confirm `HALTED_SUCCESS`. The red-first guards were
confirmed red before the fixes (the smoke rebook checks failed on the old handler; the live-refusal unit test failed
with the one-line refusal removed).

## Plan Deviations

1. **Demo live-rebook refusal added in-plan (PVL P2):** the local `rebookLesson` had no status gate and would have
   rebooked a live lesson that the API refuses; one line added, `services/bookings.ts` added to the blast radius.
2. **Validator test written after the verbatim move:** `uploads-validation.test.ts` was written red-first against the
   private behavior, then the validator was moved into `files.ts` unchanged.
3. **Singular for plus and minus 1:** "1 credit" is used when the quantity is exactly 1 (rows 5, 13), in line with
   the plan; the billing transactions table is the only place a singular appears.
4. **Narrower CSS than planned:** the 390px tab-row overflow the plan expected did not exist; only the chip fix
   was applied.
5. **10 files / 54 tests** (plan estimated about 9 files).

## Test Infra Gaps Found

- `createLibraryItem` happy path needs a browser-API shim (backlog stub above).
- Smoke has no rebook 409 (slot taken) and other-student 403 case; the room-code inequality assertion can flake
  about 1 time in 9000 (`phase-05-review-residuals_NOTE_25-11-26.md`).
- The e2e webServer startup timeout is still unexplained (not reproduced in Phase 05); Phase 06 CI work owns it.
- The copy guard covers a fixed file list and must be extended with new screens.

## SPEC Achievement

The inner loop is governed by the umbrella SPEC; the criteria are the plan's acceptance criteria.

- **Met (Fully-Automated or Hybrid gate passed in the executor run and in the independent EVL):** rebook semantics
  (smoke `rebook` 64 checks, local `bookings.test.ts`), credits wording (`credit-copy.test.ts`, 28 rows),
  shared validators (`uploads-validation.test.ts`), library guards (`library.test.ts`), runner and lockfile
  (`npm ci` plus typecheck plus tests), regression of Phases 01-04.
- **Met by agent probe (visual criteria, not automatable here):** 390px chip layout and the Phase 03 P3-13 card
  and modal in API mode. The developed behavior itself is proven by automated gates; the probe covers layout only.
- **Unmet:** none.

## SPEC Gaps

None. Declared residuals carry backlog notes (see What Was Skipped/Deferred).

## Closeout Packet

1. Selected plan: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/phase-05-parity-polish-and-unit-tests_PLAN_23-11-26.md`
2. Classification: **Ready for UPDATE PROCESS archival** at the phase level (phase VERIFIED). The program folder stays
   in `active/` because the default-password fix and Phase 06 remain; this plan and report stay inside it.
3. Finished: Steps 1-7; Phase Loop steps 1-7 ticked.
4. Verified: all automated and hybrid gates (executor and independent EVL), vc-code-reviewer pass (approved, 0 C/H/M),
   user decision approved, API-mode visual probe. Unverified: null-enrollment rebook in smoke; `createLibraryItem`
   happy path.
4b. Validate-contract: present inline in the plan (`generated-by: inner-pvl: phase-05`), Gate: PASS first pass.
5. Cleanup done: report, plan ticks, umbrella state, registry, risk pack, backlog notes, context docs. Still needed:
   none for this phase; the process commit follows this report.
6. Next valid state: separate default-account-password fix (own RIPER-5 pass, RESEARCH first), then Phase 06 Step 1
   RESEARCH.
7. Commit checkpoint: execution commit `5c1b4b9` done (31 files); process commit after UPDATE PROCESS.
8. Regression status: Phase 01-04 proving tests re-run in the same smoke and e2e runs, PASS.
9. SPEC achievement: see above; no unmet criteria.

Drift score: HIGH (4 signals: more than 10 files touched; backlog notes written and plan/registry state changed;
3+ memory-worthy findings; one in-plan scope add (demo live refusal)). No harness or protocol files touched.
Strongly recommend UPDATE PROCESS -- harness/protocol files touched. (Band is HIGH by count; the signals here are
product and process files, and UPDATE PROCESS is this session.)

Follow-up stubs: 2 new/renamed backlog notes. CONTEXT_PARTIAL: none.

## Forward Preview

### Test Infra Found
- Frontend Vitest: `npm run test --workspace @lumina/frontend`, node env, 10 files / 54 tests, helpers in
  `frontend/tests/helpers/`. Backend vitest 7 / 61. Smoke 16 domains / 705 checks. e2e 27 API + 4 demo.

### Blast Radius Changes
- New: `frontend/vitest.config.ts`, `frontend/tests/**`. Edited beyond the original plan: `services/bookings.ts`
  (demo live refusal). Shared with Phase 06: `package-lock.json`, `frontend/package.json`, `backend/scripts/smoke.ts`.
  No migration; `0007` still unused.

### Commands to Stay Green
`npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` (>= 61),
`npm run test --workspace @lumina/frontend` (>= 54), `npm run smoke` (>= 705 checks, 16 domains), `npm run e2e`
(27 + 4), `git diff --check`, `git status --porcelain -- backend/src/db`.

### Dependency Changes
`vitest 3.2.7` added to `frontend` devDependencies; `package-lock.json` changed by that line only.
