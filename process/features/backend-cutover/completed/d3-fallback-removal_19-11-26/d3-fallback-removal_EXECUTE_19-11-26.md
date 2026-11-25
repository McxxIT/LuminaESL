---
phase: d3-fallback-removal-execute
date: 2026-11-19
status: COMPLETE
feature: backend-cutover
plan: process/features/backend-cutover/completed/d3-fallback-removal_19-11-26/d3-fallback-removal_PLAN_19-11-26.md
---

# D3 - Demo Data and Fallback Removal - EXECUTE Report

TL;DR: D3 was scoped during planning to the *leakage*, not the store, because the production read path
already branched on `isApiDataMode()` (B2) and API mode already booted from an empty snapshot (B1). The
three leaks are closed: the legacy `upgrade()` path no longer injects the demo seed's assignments into
an API cache, `resetSchool()` is inert in API mode (with a console warning) and its controls are hidden
in all three Settings screens, and the demo `lumina-account` blob is now written only in demo mode. The
offline cache, `lumina-school:v1`, the import lane, and `NEXT_PUBLIC_DATA_SOURCE=local` are untouched,
so the one-release rollback stays honest. All ten Validate Contract rows pass, including two
consecutive full `npm run e2e` runs (15 API + 3 demo each), `npm run smoke`, and backend tests (30/30).

## What Was Done

### P1 - Store guards (`frontend/app/lib/school/store.ts`)

- `upgrade()` now reads `dataSource`. A collection missing from an older payload is filled from
  `createEmptySchool()` in API mode and from `createSeedSchool()` in local mode, with a comment naming
  the reason: an API cache must never gain demo homework, but an older local snapshot should keep the
  shared homework it would otherwise lose.
- `resetSchool()` returns early in API mode with
  `console.warn("Lumina: demo reset ignored in API mode.")` and returns the current snapshot. The
  signature changed from `seed: SchoolData = createSeedSchool()` to `seed?: SchoolData` so `ensureLoaded()`
  runs before the local default is built; local behavior is identical.

### P2 - UI gating and demo-only writes

- `ManagerSettings.tsx`: the admin reset block renders only when `!isApiDataMode()`.
- `StudentSettings.tsx` / `TeacherSettings.tsx`: same gate on the "Reset demo workspace" card.
- `useStudentWorkspace.ts` / `useTeacherWorkspace.ts`: `resetWorkspace()` returns early in API mode, so
  a stale callback cannot reseed even if a button survives.
- `LuminaApp.tsx`: both `localStorage.setItem("lumina-account", ...)` calls in `login()` and
  `updateAccount()` are wrapped in `isDemoMode()`. The API-boot `removeItem` cleanup stays as the
  migration path.

### P3 - Tests

- `frontend/e2e/api/no-demo-seed.spec.ts` (new, 2 tests):
  1. **Browser boot.** Seeds `lumina-school:api-cache` with a stale payload that omits `assignments`
     plus a marker course, and a real `lumina-school:v1`. Signs in as admin/student/teacher in turn;
     asserts no demo assignment id enters the cache, the stale marker course is replaced (never
     adopted), no demo course title renders, `v1` is byte-identical, and no "Reset demo" control or
     "Reset demo workspace" card exists in any role's Settings. Collects page errors and asserts none.
  2. **Store probe (Node worker).** `configureSchoolStore(createMemoryAdapter(null))` +
     `configureSchoolDataSource("api")`, then `resetSchool(seed)`: the returned snapshot is the same
     object, collections stay empty, and the warning is logged. Restores local mode in `finally`.
- `frontend/e2e/demo/regression.spec.ts` (2 tests added, now 3): an older local snapshot that omits
  `assignments` still gains the seeded homework; Settings still resets the demo school (a sentinel
  course disappears, demo course returns, homework reseeded, `seededAt` changes).

### P4 - Verification and docs

- The D2 backlog's bell follow-up was closed in passing: `frontend/app/lib/school/notifications.ts`
  maps `school.imported` to "School imported" and routes the `school` family to Settings for admins
  (`navFor`), so the bell agrees with the activity filter.
- Docs updated: `frontend/CUTOVER_PROGRESS.md` (board row, verification log, change log, closed
  `lumina-account` note, next action), `frontend/CUTOVER_PLAN.md` §Step D item 3,
  `frontend/PROGRESS.md`, `process/context/all-context.md` (board row, open questions, store gotcha,
  gate counts), `process/context/tests/all-tests.md` (spec table, suite size), plus
  `process/context/planning/all-planning.md`, `process/context/auth/demo-vs-api-mode.md`, and
  `process/context/uxui/school-data-layer.md`.

## Decisions realized

| Decision | Realization |
|---|---|
| D3-1 Remove leakage, not the store | Only `upgrade()`'s fill, `resetSchool()`, the reset controls, and the demo account writes changed |
| D3-2 `upgrade()` is data-source aware | `dataSource === "api" ? empty : seed` for a missing `assignments` |
| D3-3 Demo actions hidden and the store call inert | Three Settings gates + both workspace handlers + the store guard |
| D3-4 Demo account blob is demo-only | Both writes behind `isDemoMode()`; API boot cleanup untouched |
| D3-5 No flag removal | `NEXT_PUBLIC_DEMO_MODE` and `NEXT_PUBLIC_DATA_SOURCE` unchanged |
| D3-6 Prove it from outside | Browser boot spec + demo regression; store probe covers the inert guard |

## Defects found and fixed

None. The plan's reconnaissance had already identified the three leaks, and the tests confirmed the
fixes; no new data-integrity or contract bug surfaced during execution.

## Deviations from the plan

- **P3.2 target file.** The plan named `frontend/e2e/demo/demo.spec.ts`; the live demo spec is
  `frontend/e2e/demo/regression.spec.ts`, so the two tests were added there.
- **C1 is defense in depth, not a live code path.** `parseSchoolData` rejects a cache payload that
  omits a collection, so an API cache cannot actually reach `upgrade()`'s assignment fill today. The
  browser test therefore proves the observable contract (no demo rows, stale payload replaced, `v1`
  untouched) rather than driving `upgrade()` directly; the store branch stays as protection against a
  future relaxed parser. Recorded in the spec header as a test-infra limit.
- **Plan status bookkeeping.** The P1 edits were inherited uncommitted from an interrupted EXECUTE
  attempt and verified line by line rather than rewritten; this session completed P4, the report, and
  the doc/checkbox bookkeeping.
- **`frontend/AGENTS.md` churn.** `next dev` removed the `nextjs-agent-feedback` block during the
  Playwright runs (same as D1/D2). Restored with `git checkout` and left out of the commit.

## Test Gate Outcomes

| Contract item | Gate | Result | Evidence |
|---|---|---|---|
| C1 No seed leak on upgrade | `api/no-demo-seed.spec.ts` (browser) | PASS | demo assignment ids absent from the API cache; stale marker course replaced; no demo course title renders |
| C2 Reset control absent in API mode | `api/no-demo-seed.spec.ts` (admin/student/teacher Settings) | PASS | 0 "Reset demo" buttons, 0 "Reset demo workspace" cards |
| C3 `resetSchool` inert in API mode | store probe in the same spec | PASS | same snapshot object, collections empty, warning logged |
| C4 Local upgrade still fills assignments | demo regression "fills the shared homework into an older local snapshot" | PASS | seeded homework card visible |
| C5 Demo reset still works | demo regression "resets the demo school from settings" | PASS | sentinel course gone, demo course back, homework reseeded, `seededAt` changed |
| C6 API never writes `v1` | existing `api/cache-keys.spec.ts` | PASS | byte-identical `v1` |
| C7 Import lane intact | existing `api/import.spec.ts` (unchanged) | PASS | 2/2 |
| C8 Repo gates | typecheck, lint, backend tests, smoke, e2e x2 | PASS | see the gates table |
| C9 No destructive DB work | grep gate + `git diff --stat` | PASS | no reset/push/truncate/seed call added; no `.env*` edit |
| C10 Docs match reality | read-through of the updated docs | PASS | paths, counts, and behavior match the code |

### Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | exit 0 (both workspaces) |
| Lint | `npm run lint` | exit 0 (both workspaces) |
| Backend tests | `npm run test --workspace @lumina/backend` | 5 files, 30 tests, all pass |
| Browser suite, run 1 | `npm run e2e` | 15 API pass (58.0 s) + 3 demo pass (13.5 s), exit 0 |
| Browser suite, run 2 | `npm run e2e` | 15 API pass (53.9 s) + 3 demo pass (11.8 s), exit 0, no cleanup between runs |
| Smoke | `npm run smoke` | 13/13 domains, 353 checks, settings restored |
| Whitespace | `git diff --check` | exit 0 |

## Residue left in the dev database

D3's new browser spec writes no database rows (localStorage only) and the store probe is in-memory.
Residue is therefore the D2 baseline (6 imported schools, 7 attachments, 12 `school.imported` rows)
plus one import fixture per full `e2e` run. Six more import runs accumulated between the D2 closeout
and this one (each run imports once and force-re-runs once); the two runs in this closeout are the
last two.

| Row | D2 baseline | After D3 closeout |
|---|---|---|
| imported students (+ `student_profiles`) | 6 | 12 |
| courses (+ unit, lesson plan, enrollment) | 6 | 12 |
| lessons (2031-03-05, `ESL-IMPORT`) | 6 | 12 |
| approved cancellation requests | 6 | 12 |
| credits | 6 | 12 |
| attachments (`import-fixture.pdf`) | 7 | 13 |
| `activity` rows `school.imported` | 12 | 24 |

A disposable test database is still the only real fix; the smoke suite has the same gap.

## Reported, not fixed

- **`next/image` blob warning (pre-existing).** `cancellation-refund.spec.ts` still logs the
  `width/height modified` warning (same as D1/D2; cosmetic, unrelated to D3).
- **`frontend/AGENTS.md` churn.** See deviations; restored before the commit.

## Handoff

- Plan: `d3-fallback-removal_PLAN_19-11-26.md` in this folder, all P1-P4 and V1-V5 boxes ticked.
- Report: this file.
- Update-process record: `d3-fallback-removal_REPORT_19-11-26.md` in this folder.
- Step D (and the cutover plan's execution steps) are now closed. Follow-ups that remain are backlog
  notes, not cutover steps: CI wiring (`backlog/e2e-ci-wiring_NOTE_18-11-26.md`), the import
  bell/nav cosmetics (`backlog/import-followups_NOTE_19-11-26.md`), a disposable test database, and
  deleting `NEXT_PUBLIC_DEMO_MODE` / `NEXT_PUBLIC_DATA_SOURCE` in a later release.
