---
name: plan:d3-fallback-removal
description: "D3: remove demo-seed leakage and demo-only actions from the API-mode production path while keeping the local store, the import lane, and the rollback flag for one release"
date: 19-11-26
feature: backend-cutover
status: COMPLETE (P1-P4 done, all gates green)
---

# D3 - Demo Data and Fallback Removal from the Production Path

**Date**: 19-11-26
**Status**: COMPLETE - P1-P4 executed; gates recorded in `d3-fallback-removal_EXECUTE_19-11-26.md`.
**Complexity**: SIMPLE-MEDIUM (four frontend files plus one store guard and two test files; no schema, API, or dependency change)
**Branch**: developing
**Umbrella**: `frontend/CUTOVER_PLAN.md` §Step D item 3 and the D2 handoff.
**Execution Model**: single vc-execute-agent, sequential: P1 store guard, P2 UI gating, P3 tests, P4 docs.

TL;DR: D3 is **not** "delete the browser store". Every write service already branches on
`isApiDataMode()` (B2), and API mode already starts from an empty snapshot (`store.ts:77-84`). What
remains is demo *leakage*: `upgrade()` injects the demo seed's assignments into an older API cache
(`store.ts:71`), the "Reset demo" control is still reachable in API mode and replaces the live
snapshot with demo data until the next refresh, and API profile updates still write the demo
`lumina-account` blob. D3 closes those three, keeps the offline cache (it is the outage path, not
the cutover fallback), keeps `lumina-school:v1` and the import lane, and keeps
`NEXT_PUBLIC_DATA_SOURCE=local` as the documented rollback for one release.

## Overview

The umbrella phrase "delete the browser-store fallback from the production path" predates B2. In the
current code the production path no longer reads the local store for records: `store.ts` selects its
adapter by `dataSource`, `ensureLoaded()` returns `createEmptySchool()` in API mode, and every
service takes the API branch under `isApiDataMode()`. The remaining risk is therefore not a missing
API path but **demo data appearing inside an API-mode session** plus **demo-only actions that are
still offered**.

Reconnaissance (recorded here instead of a separate RESEARCH document, because the answers are
file-local and already verified):

| Question | Answer | Evidence |
|---|---|---|
| Does API mode start from the demo seed? | No | `store.ts:77-84` |
| Can the demo seed still enter an API session? | Yes, via the legacy upgrade path | `store.ts:71` injects `createSeedSchool().collections.assignments` when a cached payload predates `assignments` |
| Is "Reset demo" reachable in API mode? | Yes, from manager/student/teacher settings | `ManagerSettings.tsx:79-80`, `useStudentWorkspace.ts:227`, `useTeacherWorkspace.ts:265` |
| Is the demo account blob still written in API mode? | Yes, on profile updates | `LuminaApp.tsx:150,155`; API boot removes it at `:63,:66` |
| Is the offline cache the "fallback" D3 removes? | No - keep it | `bootstrap.ts:141-170` (same-account cache, outage path) |
| Is `NEXT_PUBLIC_DATA_SOURCE=local` still a real rollback? | Yes - keep for one release | `mode.ts:15-17` |
| Does the import lane depend on local mode? | Yes - keep | `capture.ts` reads `SCHOOL_STORAGE_KEY`; import tab is `isApiDataMode()`-only |

## Goals

- An API-mode session never contains demo seed records, including after a cache upgrade.
- Demo-only actions (reset demo, demo account blob) are unreachable or inert in API mode.
- Demo/local mode keeps seeding, resetting, legacy workspace migration, and `lumina-school:v1`.
- The import lane and `lumina-school:pending-import` capture are untouched.
- `NEXT_PUBLIC_DATA_SOURCE=local` still switches the whole app back to local mode.

## Non-goals

- Removing the offline cache fallback (`lumina-school:api-cache`) - it is the documented outage path.
- Removing demo mode or the demo seed module - demo/local must keep working.
- Removing the import tab, capture, or the `pending-import` key.
- Deleting `NEXT_PUBLIC_DATA_SOURCE` or `NEXT_PUBLIC_DEMO_MODE` - that is the release after D3.
- Bundle-level seed elimination. The seed module is referenced by local-mode code in the same
  runtime bundle; tree-shaking it out is not possible with runtime env flags and is out of scope.
- The bell title/nav and `next/image` findings (backlogged in `import-followups_NOTE_19-11-26.md`).

## Decisions

- **D3-1 Remove leakage, not the store.** The store stays; only demo data reaching API mode goes.
- **D3-2 `upgrade()` becomes data-source aware.** When `dataSource === "api"`, a missing collection
  starts empty, never from `createSeedSchool()`. Local mode keeps the current fill behavior so an
  older local snapshot still gains shared homework rather than losing it.
- **D3-3 Demo actions are hidden, and the store call is inert.** Hide the reset controls under
  `!isApiDataMode()`; also make `resetSchool()` a no-op that logs a warning in API mode, so a future
  call site cannot resurrect demo data.
- **D3-4 The demo account blob is written only in demo mode.** Guard the two `localStorage.setItem`
  calls in `login()` / `updateAccount()`; the API boot cleanup stays as the migration path.
- **D3-5 No flag removal.** Both env flags stay; D3 changes behavior *under* the API flag, not the
  flag's meaning. This keeps the one-release rollback honest.
- **D3-6 Prove it from outside.** The new tests drive the real app: an API cache without
  `assignments` must stay empty after boot, and the reset control must not exist in API mode.

## Scope

**In scope**

- `frontend/app/lib/school/store.ts`: `upgrade()` data-source branch; `resetSchool()` API guard.
- `frontend/app/components/manager/ManagerSettings.tsx`, `student/StudentSettings.tsx`,
  `teacher/TeacherSettings.tsx`: hide the reset-demo controls in API mode.
- `frontend/app/components/student/useStudentWorkspace.ts`, `teacher/useTeacherWorkspace.ts`: the
  reset handlers become unreachable in API mode (guard the handler, not just the button).
- `frontend/app/components/LuminaApp.tsx`: guard the two demo account writes.
- `frontend/e2e/api/*.spec.ts` (new or extended): API-mode no-seed assertions.
- `frontend/e2e/demo/*` regression: reset still works and legacy upgrade still fills assignments.
- Docs: `frontend/CUTOVER_PROGRESS.md`, `frontend/CUTOVER_PLAN.md`, `frontend/PROGRESS.md`,
  `process/context/all-context.md`, `process/context/uxui/school-data-layer.md`.

**Out of scope**

- Backend changes of any kind.
- `lumina-school:api-cache`, `cache-owner`, `pending-import`, and the import UI.
- Removing the `lumina-account` cleanup on API boot (that is the migration path).

## Touchpoints

Modified: `frontend/app/lib/school/store.ts`, `frontend/app/components/LuminaApp.tsx`,
`frontend/app/components/manager/ManagerSettings.tsx`,
`frontend/app/components/student/StudentSettings.tsx`,
`frontend/app/components/teacher/TeacherSettings.tsx`,
`frontend/app/components/student/useStudentWorkspace.ts`,
`frontend/app/components/teacher/useTeacherWorkspace.ts`,
`frontend/e2e/api/cache-keys.spec.ts` or a new `frontend/e2e/api/no-demo-seed.spec.ts`,
`frontend/e2e/demo/demo.spec.ts`, and the five docs listed above.

Read-only references: `frontend/app/lib/auth/mode.ts`, `frontend/app/lib/school/api/bootstrap.ts`,
`frontend/app/lib/school/import/capture.ts`, `frontend/app/lib/school/seed.ts`,
`process/context/all-context.md`, `process/context/tests/all-tests.md`.

## Public Contracts

| Contract | Shape | Consumers |
|---|---|---|
| API-mode snapshot | starts empty and only ever holds bootstrap/cache payloads; never demo seed records | every screen in API mode |
| API-mode controls | no "Reset demo" affordance; `resetSchool()` is inert with a console warning | manager/student/teacher settings |
| Local mode | unchanged seeding, reset, legacy migration, `lumina-school:v1` | demo regression spec, local users |
| Rollback flag | `NEXT_PUBLIC_DATA_SOURCE=local` still switches every branch back to local | release safety |
| Import lane | capture + `pending-import` + admin Import tab unchanged | mid-migration operators |

## Blast Radius

- **Frontend store**: one branch in `upgrade()` and one guard in `resetSchool()`. A wrong branch
  makes an older API cache lose its `assignments` (acceptable: empty beats another school's data) or
  makes local mode stop filling them (caught by the demo regression).
- **Settings screens**: three components lose a control in API mode. Risk is a layout hole where the
  button was - covered by the existing settings e2e render.
- **Workspace hooks**: two handlers become inert in API mode; no data-fetching path changes.
- **Demo mode**: must be untouched; proven by the demo regression spec plus a reset assertion.
- **No backend, no schema, no dependency, no env file change.**

## Implementation Checklist

### P1 Store guards
- [x] P1.1 `upgrade()`: read `dataSource`; when `"api"`, initialize a missing collection from
      `createEmptySchool()`; when `"local"`, keep the current `createSeedSchool()` fill for
      `assignments`. Comment the reason (an API cache must never gain demo homework).
- [x] P1.2 `resetSchool()`: return early with `console.warn("Lumina: demo reset ignored in API mode.")`
      when `dataSource === "api"`; keep the demo behavior identical for local.
- [x] P1.3 `npm run typecheck` and `npm run lint` (both exit 0 from `frontend`, 2026-11-19).

  Note: the P1 working-tree edits were inherited uncommitted from an interrupted EXECUTE attempt
  (they match this plan verbatim); they were re-verified line by line, not rewritten.

### P2 UI gating
- [x] P2.1 `ManagerSettings.tsx`: render the reset block only when `!isApiDataMode()`.
- [x] P2.2 `StudentSettings.tsx` / `TeacherSettings.tsx`: same gate on the "Reset demo workspace" card.
- [x] P2.3 `useStudentWorkspace.ts` / `useTeacherWorkspace.ts`: guard the reset handler with
      `isApiDataMode()` so a stale callback cannot reset even if a button remains.
- [x] P2.4 `LuminaApp.tsx`: wrap the two `lumina-account` writes in `isDemoMode()`.
- [x] P2.5 `npm run typecheck` and `npm run lint` (both exit 0 from `frontend`, 2026-11-19).

### P3 Tests
- [x] P3.1 New `frontend/e2e/api/no-demo-seed.spec.ts` (or an added case in `cache-keys.spec.ts`):
      seed an API cache payload that omits `assignments`, boot as a real account, and assert
      `assignments` stays empty, no demo course/user title appears, the reset control is absent, and
      `lumina-school:v1` is untouched.
- [x] P3.2 Extend `frontend/e2e/demo/demo.spec.ts`: local reset still restores the demo school, and an
      older local snapshot still gains seeded `assignments`.
- [x] P3.3 Re-run the existing `api/import.spec.ts` and `api/cache-keys.spec.ts` unchanged - D3 must
      not disturb the capture/import lane.

  Implementation note: P3.1 landed as `frontend/e2e/api/no-demo-seed.spec.ts` with two tests: the
  browser boot (admin/student/teacher settings, stale cache, `v1` byte-identical) and a store probe
  (`configureSchoolDataSource("api")` + `resetSchool()` inert with the warning logged). The live demo
  spec file is `frontend/e2e/demo/regression.spec.ts`; P3.2 added two tests there.
  C1 limit: `parseSchoolData` rejects a cache payload that omits a collection, so the API cache can
  never reach `upgrade()` - the browser test proves the observable contract instead (see Deviations).

### P4 Verification and docs
- [x] V1 `npm run e2e` twice back to back (2026-11-20): run 1 API 15/15 (58.0 s) + demo 3/3 (13.5 s),
      run 2 API 15/15 (53.9 s) + demo 3/3 (11.8 s); exit 0 both times, no cleanup between runs.
- [x] V2 `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend` (30/30),
      `npm run smoke` (13/13 domains, 353 checks, settings restored) - all exit 0 on 2026-11-20.
- [x] V3 Safety: no `db:reset`/`push`/`truncate` added (grep gate shows only the intentional
      `.for("update")`), no `.env*` edit, `git diff --check` exit 0.
- [x] V4 Docs: `CUTOVER_PROGRESS.md` (board row + verification/change log), `CUTOVER_PLAN.md` (Step D
      item 3), `PROGRESS.md`, `process/context/all-context.md` (board row, open questions, store
      gotcha, gate counts), `process/context/tests/all-tests.md` (spec table, suite size, last run),
      `process/context/uxui/school-data-layer.md`, plus `planning/all-planning.md`,
      `auth/demo-vs-api-mode.md`, `database/booking-and-credit-integrity.md`.
- [x] V5 Report: `d3-fallback-removal_EXECUTE_19-11-26.md` in this folder, with the residue delta
      against the D2 baseline (6 imported schools / 7 attachments / 12 markers -> 12 / 13 / 24).

## Acceptance Criteria

| Umbrella item | Proving gate |
|---|---|
| "Delete duplicated seed data from the production path" | no demo record or demo assignment fill in an API session (P3.1) |
| "Remove the browser-store fallback from the production path" | API mode never reads `lumina-school:v1`; `v1` untouched (existing cache-keys spec + P3.1) |
| "Keep a documented rollback flag for one release" | `NEXT_PUBLIC_DATA_SOURCE=local` still switches all branches (demo regression + flag untouched) |
| Demo mode still works | demo regression spec green, including reset |
| D2's import lane still works | `api/import.spec.ts` green, unchanged |

## Validate Contract

| Contract item | Command / probe | Pass condition |
|---|---|---|
| C1 No seed leak on upgrade | P3.1: API cache without `assignments` | `assignments` empty after boot; no demo titles rendered |
| C2 Reset control absent in API mode | P3.1: open manager/student/teacher settings in API mode | no "Reset demo" control; handler inert |
| C3 `resetSchool` is inert in API mode | store probe in the spec (`configureSchoolDataSource("api")` + `resetSchool()`) | snapshot unchanged, warning logged |
| C4 Local upgrade still fills assignments | demo regression with an old local snapshot | `assignments` non-empty after load |
| C5 Demo reset still works | demo regression | demo school restored |
| C6 API never writes `v1` | existing `api/cache-keys.spec.ts` | byte-identical `v1` |
| C7 Import lane intact | existing `api/import.spec.ts` | passes unchanged |
| C8 Repo gates | typecheck, lint, backend tests, smoke, e2e x2 | all exit 0 |
| C9 No destructive DB work | grep gate + `git diff --stat` | no reset/push/truncate/seed call added; no `.env*` edit |
| C10 Docs match reality | read the five V4 docs | behavior and paths match the code |

## Verification Evidence

| Gate | Strategy | Command |
|---|---|---|
| Static | Fully-Automated | `npm run typecheck`, `npm run lint` |
| Store guards | Fully-Automated | `configureSchoolDataSource("api")` + `resetSchool()` probe inside the spec |
| Cache upgrade | Hybrid | Playwright with a seeded API cache missing `assignments` |
| Demo regression | Hybrid | `npm run e2e` demo config |
| Import lane | Hybrid | `npm run e2e` → `api/import.spec.ts` |
| Safety | Agent-Probe | grep gate + `git diff --stat` |
| Docs | Agent-Probe | V4 read-through |

## Risks

- **Local-mode regression.** Making `upgrade()` data-source aware could stop the legacy fill in demo
  mode. Mitigation: branch only on `dataSource`, and keep a demo assertion for the fill (C4).
- **Hidden demo action.** A reset call site not covered by the three settings screens would still be
  reachable. Mitigation: the store-level inert guard in P1.2 makes any call site harmless.
- **Test seam.** `configureSchoolDataSource` exists for tests; the spec must restore it so later
  tests in the same worker are not affected.
- **Scope creep.** The offline cache looks like a fallback but is the outage path. Mitigation:
  explicit non-goal; cache-keys spec stays unchanged as the guard.

## Phase Completion Rules

- A phase is not complete while any checklist box is open or any Validate Contract row is red.
- P1 is not complete until both the API and local upgrade behaviors are proven (C1 + C4).
- P2 is not complete until the control is absent in API mode and the handler is inert at the store level.
- P3 is not complete until the existing import and cache-keys specs pass unchanged.
- P4 is not complete until `npm run e2e` passes twice consecutively.
- No phase may run `db:reset`, `db:push`, `truncate`, or edit `.env*`; a precondition failure is reported, never repaired.

## Resume and Execution Handoff

Status: COMPLETE (P1-P4 done; all Validate Contract rows green on 2026-11-20).

- Execute in order: P1 → P2 → P3 → P4. P3 depends on P1's behavior, not on P2's markup.
- Read first: `process/context/all-context.md`, `process/context/tests/all-tests.md`,
  `frontend/CUTOVER_PLAN.md` §Step D, and the D2 archive
  `process/features/backend-cutover/completed/d2-one-time-import_19-11-26/`.
- Regression commands that must stay green: `npm run typecheck`, `npm run lint`,
  `npm run test --workspace @lumina/backend`, `npm run smoke`, `npm run e2e`.
- Preconditions: local Postgres reachable, `backend/.env` present, seeded database, ports
  3000/3100/4000 free, no `.env*` edits.
- Residue baseline to compare at the end: 6 imported schools, 7 attachments, 12 `school.imported` rows.
- If a step turns out to be wrong, update this plan in the same session rather than deviating silently.

## Next Step

Review the four scope decisions (D3-1 to D3-6) and the non-goals, then say **ENTER EXECUTE MODE**
to start P1. This plan supersedes the umbrella's broader "delete the fallback" wording; the local
store, the offline cache, and the import lane all stay.
