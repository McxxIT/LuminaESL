# Phase Blast Radius Registry — `lumina-v1-finish`

Umbrella plan: `process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md`

| Phase | Primary Owned Surfaces | Shared / Regression-Sensitive Surfaces | Migration? |
|---|---|---|---|
| **01 — Dev DB Migration 0004 Alignment** | Local PostgreSQL `lumina` DB (backup + approved cleanup + `0004`), `process/context/{all-context.md,database/*,tests/all-tests.md}`, `booking-credit-concurrency_NOTE_18-11-26.md` | Existing `smoke` (14/14) & `e2e` (23 API + 3 demo) suites | Applies existing `0004` |
| **02 — Security & Staff-Managed Credits** | `backend/src/routes/{uploads,credits}.ts`, `backend/src/lib/scope.ts`, `frontend/app/components/student/StudentBilling.tsx`, `frontend/app/lib/school/services/credits.ts` | `backend/scripts/smoke.ts`, `backend/tests/contract.test.ts`, `frontend/e2e/api/{uploads,booking,cancellation-refund,credit-concurrency}.spec.ts` | No |
| **03 — Auth & Account Lifecycle Hardening** | `backend/src/routes/{auth,users}.ts`, `backend/src/plugins/auth.ts`, `backend/src/config/env.ts`, `backend/src/app.ts`, `frontend/app/lib/api/auth.ts`, settings password UI | `backend/tests/{app,contract,password}.test.ts`, `frontend/e2e/api/auth.spec.ts`, `frontend/e2e/demo/regression.spec.ts` | Optional (only if password-reset metadata needed) |
| **04 — Curriculum Library** | `backend/src/db/{schema.ts,migrations/0005_*.sql,migrations/meta/*}`, new `backend/src/routes/library.ts`, `backend/src/routes/{index,school}.ts`, `backend/src/lib/{scope,activity}.ts`, `frontend/app/lib/school/{types,store,seed,permissions,selectors,views,notifications,api/bootstrap,api/library,services/library,services/index}.ts`, `frontend/app/lib/types.ts`, `frontend/app/components/manager/{ManagerCurriculum,ManagerLibrary,LibraryForms,ManagerSchedule,ManagerStudents}.tsx`, `frontend/app/components/teacher/TeacherLessons.tsx`, `frontend/app/components/student/{StudentLessons.tsx,useStudentWorkspace.ts}`, `frontend/e2e/api/curriculum-library.spec.ts` | `backend/tests/contract.test.ts`, `backend/scripts/smoke.ts` (shared with 05/06; self-contained `library` domain + cleanup), `frontend/e2e/demo/regression.spec.ts`, Phase 02 `scope.ts`/uploads proving tests, Phase 03 auth tests. NOT touched: `routes/{lessons,bookings,uploads,school-import,notifications}.ts`, `globals.css`, `lib/data.ts` (Phase 05), `playwright.config.ts` | Yes (`0005`) |
| **05 — Parity Polish & Frontend Unit Tests** | `backend/src/routes/lessons.ts` (rebook handler only), `frontend/vitest.config.ts` (new), `frontend/tests/**` (new helper + ~9 test files), `frontend/package.json`, `frontend/app/globals.css`, `frontend/app/lib/data.ts`, `frontend/app/lib/school/{files,notifications}.ts`, `frontend/app/lib/school/services/{uploads,library,people}.ts`, copy-only: `frontend/app/components/{LuminaApp.tsx,manager/{ManagerSchedule,ManagerStudents,PeopleForms}.tsx,student/{StudentBilling,StudentLessons,StudentOverview}.tsx}` | `backend/scripts/smoke.ts` (`rebookScenario`; shared with 06), `package-lock.json` + `frontend/package.json` (shared with 06 CI `npm ci`), `frontend/e2e/api/*`, `frontend/e2e/demo/regression.spec.ts` (regression only). NOT touched: root `package.json` (workspaces test script already covers it), `frontend/playwright.config.ts` and `playwright.demo.config.ts` (Phase 06), `backend/src/db/*`, `backend/tests/*` | No |
| **06 — CI & Docker Compose Packaging** | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `README.md`, `backend/src/app.ts` (`/health/ready` if added) | All workspace scripts in root `package.json`, `frontend/playwright.config.ts`, `backend/scripts/smoke.ts` | No |

## Coordination Rules

1. Phases execute strictly sequentially (`01 -> 02 -> 03 -> 04 -> 05 -> 06`); never edit two phases in the same uncommitted worktree.
2. Whenever a later phase touches a shared surface (e.g., `uploads.ts` in Phase 04 after Phase 02, `lessons.ts` in Phase 05 after Phase 04), EVL MUST run a targeted regression check on the earlier phase's proving tests.
3. Every schema edit (`schema.ts` in Phase 04) must update generated migrations, bootstrap, `frontend/app/lib/school/types.ts`, and `backend/tests/contract.test.ts` in the same phase.

## Phase Status

- Phase 01 — status: DONE
- Phase 02 — status: DONE
- Phase 03 — status: DONE (24-11-26; VERIFIED with gaps, review approved-with-concerns; shared surfaces `backend/scripts/smoke.ts`, `frontend/playwright.config.ts` (backend env `AUTH_RATE_LIMIT_MAX`), `frontend/e2e/support/api.ts` changed, so Phase 04-06 EVL must keep them green)
- Phase 05 — status: DONE (25-11-26; VERIFIED, review approved by the user; execution commit 5c1b4b9; shared surfaces `backend/scripts/smoke.ts` (`rebookScenario`, 705 checks), `backend/src/routes/lessons.ts` (rebook), `frontend/package.json` + `package-lock.json` (vitest 3.2.7), `frontend/app/lib/school/files.ts` and `services/{library,uploads,bookings,people}.ts` changed, so Phase 06 EVL/CI must keep them green; no migration, `0007` still unused)
- Phase 04 — status: DONE (24-11-26; VERIFIED with gaps, review approved-with-concerns; shared surfaces `backend/scripts/smoke.ts` (`library` domain), `backend/src/routes/{courses,uploads}.ts`, `backend/src/lib/scope.ts`, `frontend/e2e/demo/regression.spec.ts` changed, so Phase 05-06 EVL must keep them green; migrations `0005`, `0006` applied, next free number `0007`)

## Phase 04 Overlap Note (24-11-26)

- Phase 05 shared: `backend/scripts/smoke.ts` (append-only `library` domain in 04; rebook asserts in 05), role UI files (`StudentLessons.tsx`, `TeacherLessons.tsx`: 04 adds materials; 05 relabels credits), `lessons.ts` (05 only; 04 does not touch). `globals.css` and `lib/data.ts` are Phase 05 only.
- Phase 06 shared: `backend/scripts/smoke.ts` only (CI runs it). No file conflicts; sequential order resolves them.
- Phase 04 EVL must rerun Phase 02 uploads and Phase 03 auth proving tests (shared `scope.ts`, `smoke.ts`, `regression.spec.ts`).

## Phase 04 Step F Addendum (24-11-26, review fixes)

- Phase 04 additionally owns: `backend/src/routes/{courses,uploads}.ts` (plan-attach contract, download containment), new `backend/src/lib/upload-path.ts`, new `backend/tests/upload-path.test.ts`, migration `0006_*.sql` + `meta/0006_snapshot.json` (+ generated `_journal.json` edit), `frontend/app/lib/school/api/curriculum.ts`, `frontend/app/lib/school/services/curriculum.ts`. Re-touched (already Phase 04): `routes/{library,school}.ts`, `db/schema.ts`, `types.ts`, `ManagerLibrary.tsx`, `services/library.ts`, `backend/scripts/smoke.ts`, `frontend/e2e/{api/curriculum-library,demo/regression}.spec.ts`.
- Overlap with Phase 02: `uploads.ts` and plan-attach are Phase 02 proving surfaces; Phase 04 EVL reruns smoke `uploads` + `frontend/e2e/api/uploads.spec.ts`. `courses.ts` was Phase 04-untouched before Step F; no other phase owns it.
- Overlap with Phase 05/06: none new (`lessons.ts`, `globals.css`, `data.ts`, vitest runner untouched; `smoke.ts` stays append/edit-in-domain, sequential order resolves). Migration `0006` is the next number; Phase 05/06 declare no migration.

## Phase 05 Supplement Note (24-11-26)

- Corrected Phase 05 claim (PLAN-SUPPLEMENT): root `package.json` removed (root `npm run test` is `--workspaces --if-present`); `playwright.config.ts` stays Phase 06 (e2e startup flake deferred there); added `package-lock.json`, `files.ts`, `notifications.ts`, `services/{uploads,library,people}.ts`, and copy-only component list.
- Overlap with Phase 06: `package-lock.json` and `frontend/package.json` (Phase 05 adds vitest; Phase 06 CI runs `npm ci` against it, so Phase 05 verifies `npm ci` locally), `backend/scripts/smoke.ts` (Phase 05 edits `rebookScenario` only; Phase 06 only runs it). No file conflicts; sequential order resolves them.
- Overlap with Phase 04: `services/library.ts`, `StudentLessons.tsx`, `TeacherLessons.tsx` (CSS only for chips), `smoke.ts`; Phase 05 EVL reruns smoke `library` and `e2e/api/curriculum-library.spec.ts`.
- Out of scope and gating Phase 06: `default-account-password` fix runs as a separate plan after Phase 05, before Phase 06.
- PVL P2 (24-11-26): Phase 05 also edits `frontend/app/lib/school/services/bookings.ts` (local `rebookLesson`, one-line `live` refusal). No other phase claims it; no overlap.
- No migration; `0007` remains unused.
