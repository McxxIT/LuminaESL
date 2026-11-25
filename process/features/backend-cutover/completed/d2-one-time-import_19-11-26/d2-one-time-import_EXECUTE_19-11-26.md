---
phase: d2-one-time-import-execute
date: 2026-11-19
status: COMPLETE
feature: backend-cutover
plan: process/features/backend-cutover/completed/d2-one-time-import_19-11-26/d2-one-time-import_PLAN_19-11-26.md
---

# D2 - One-Time Import - EXECUTE Report

TL;DR: A browser school can now be imported into Postgres once, faithfully, from an admin-only tab.
The import is one bulk endpoint pair (`POST /school/import` + `/import/preview`) backed by a pure
planner and one transaction, so timestamps, actors, request review state, credit signs, lesson end
times, and attachment bytes survive. The blocker that made this impossible is closed: API mode no
longer writes `lumina-school:v1` (it caches to `lumina-school:api-cache`), and the local school is
copied to `lumina-school:pending-import` before the first bootstrap. All 13 Validate Contract rows
pass, including two consecutive full `npm run e2e` runs (13 API + 1 demo each), `npm run smoke`
(13/13 domains, 343 checks), backend tests (30/30), and the receipt gate, which downloads the receipt
in the browser and proves it matches the response. One real data-integrity bug was found by the new
spec and fixed: profile ids collide with user ids in the browser store, so the flat id map pointed
`enrollments.student_id` at a profile row and the first real import failed its foreign key. The work is
committed in five self-contained commits (`1f52ba7` → `2869049`).

## What Was Done

### P1 - Store-key split and capture (frontend)

- `store.ts` exports `API_CACHE_KEY = "lumina-school:api-cache"`, keeps `SCHOOL_STORAGE_KEY` for
  local/demo mode, and `hydrateSchool()` now saves through `apiCacheAdapter` when
  `dataSource === "api"` (browser-default adapter only) and through `adapter` otherwise. The comment
  names the bug this closes: hydrating the bootstrap into `v1` overwrote the user's local school on
  the first API sign-in.
- `api/bootstrap.ts` builds its cache adapter on `API_CACHE_KEY`, imports the constant instead of
  reusing `SCHOOL_STORAGE_KEY`, and calls `captureLocalSnapshot()` defensively before it reads, so
  every entry point into the API read path captures first.
- `school/import/capture.ts` owns the keys (`pending-import`, `imported:<seededAt>`),
  `looksLikeLocalSnapshot()` (schema version 3, non-empty `seededAt`, at least one record and at least
  one non-UUID id), `captureLocalSnapshot({ force })` (idempotent, never overwrites an existing
  capture, never re-captures an already-archived `seededAt`, try/catch so storage errors cannot break
  boot), `readPendingImport()`, `archivePendingImport()`, `clearPendingImport()`, `hasImportedArchive()`.
- `LuminaApp.tsx` calls `captureLocalSnapshot()` in the API bootstrap effect before
  `loadSchoolFromApi`, and `school/index.ts` exports the capture helpers the UI needs.
- `frontend/e2e/api/cache-keys.spec.ts` proves the guarantee from the outside: after an API login,
  `lumina-school:v1` is byte-identical to what was seeded, the attachment bytes are untouched,
  `lumina-school:api-cache` holds the bootstrap, `cache-owner` is right, `pending-import` exists and a
  second boot does not replace it. A second test proves a UUID-only payload is treated as an API cache
  and is not captured.

### P2 - Backend import core

- `backend/src/lib/school-import.ts`: zod schema mirroring `SchoolData` v3 (all 16 collections,
  `version: 3` literal, ISO dates/timestamps, `exclude`, `options`, and the `localId -> serverId`
  attachment map); pure `buildImportPlan()` (users adopted by email, profiles adopted when the user
  already has one, seed exclusion from the client-declared `exclude`, topological order, required
  parents drop the record, optional FKs null, avatar palette -> hex, warning list capped at 200,
  `pendingUploads` counted in dry runs); `applyImportPlan(tx, plan)` writing every collection in order
  plus an upsert for settings; `loadExistingSchool()`, `findImportMarker()`, `avatarColor()`.
- `backend/src/routes/school-import.ts`: `POST /import/preview` and `POST /import`, both
  `preHandler: app.requireRole("admin")` and `bodyLimit: 8 * 1024 * 1024`. The real route hashes the
  default password once, opens `app.db.transaction`, checks the marker (409 unless
  `options.force`), plans and applies, logs `school.imported` (`targetType: "school"`,
  `targetId: source.seededAt`), and answers 201 with counts, `idMap`, `createdIds`, and warnings.
- Registered in `routes/index.ts` under the same `/school` prefix; `"school.imported"` added to the
  backend `ActivityAction` union. The admin activity filter already routes `school.*` to Settings.
- `backend/tests/school-import.test.ts`: 13 pure planner/schema tests (no database) covering id
  remapping and history fidelity, adopt-by-email, profile adoption, the profile/user id collision,
  seed exclusion on and off, required-parent drops vs optional-FK nulls, review state / credit sign /
  activity actors, pending uploads vs `missing-bytes`, uploaded-attachment adoption, avatar mapping,
  settings opt-in, and payload rejection for a wrong version or an empty `seededAt`.

### P3 - Admin import UI

- `school/api/import.ts` types the response and wraps `previewImport()` / `runImport()`.
- `school/import/plan.ts` adds `canonicalJson()` and `diffAgainstSeed()` (byte-identical records vs
  `createSeedSchool()`), `attachmentsWithBytes()`, `dataUrlToFile()`, `readAttachmentData()`.
- `school/import/run.ts` orchestrates: preview sends `attachments: {}` and uploads nothing; a real run
  uploads each pending attachment through `POST /uploads` (skipping >5 MB and reporting failures),
  sends the map, archives the capture, clears the pending key, and returns `uploadFailures`;
  `buildReceipt()` renders the JSON receipt.
- `AdminSettings.tsx` gained a third tab, "Import local data", only when `isApiDataMode()`. It shows
  the pending capture (records + timestamps), a "Capture again" action, skip-seed and import-settings
  toggles, Preview -> Import, per-collection counts, warnings, the already-imported notice, an empty
  state, and a receipt download. The pending capture stays intact when a run fails, so it can be
  retried.

### P4 - Verification and docs

- `frontend/e2e/support/local-school.ts` builds a synthetic local school (adopted admin/teacher, a
  brand-new student, course/unit/plan chain, enrollment, a completed 09:00-09:25 lesson dated
  2031-03-05, approved cancellation request with review metadata, rating, credit entry, one PDF whose
  bytes live under `lumina-school-file:<id>`) and seeds it through `addInitScript`.
- `frontend/e2e/api/import.spec.ts` (2 tests): seed, sign in, open the tab, preview (asserting the
  bootstrap counts and marker are unchanged), import (201), then prove through `/school/bootstrap`
  the student/avatar/`createdAt`, lesson `endTime`/`createdAt`/`createdBy`, request status plus
  attachment, credit balance sign/amount, and byte-identical attachment download; download the receipt
  and compare `createdIds`/`totals` with the response; assert the marker row and that `v1` is still
  byte-identical; then 409 on repeat and 201 on a forced empty re-run without new lessons. The second
  test proves 401 anonymous and 403 for manager/teacher/student. The spec never resets or seeds the DB.
- Docs updated (V5): `frontend/PROGRESS.md`, `frontend/CUTOVER_PROGRESS.md` (board row, D2 checklist,
  corrected cache-key bullets), `frontend/CUTOVER_PLAN.md` (Step D item 2, B1.2 key split),
  `process/context/all-context.md` (storage keys + import contract + gate counts),
  `process/context/tests/all-tests.md` (new specs, 14-test suite, residue).

## Defects found and fixed

1. **Profile ids overwrote user ids in the import id map (real, would have blocked every real
   import).** The browser store keys profiles by their user (`studentProfiles["local-student"].id ===
   "local-student"`). `buildImportPlan` recorded every created record in one flat map, so creating the
   student profile replaced `idMap["local-student"]` with the profile UUID; the enrollment then wrote
   that UUID into `enrollments.student_id` and Postgres rejected it
   (`enrollments_student_id_users_id_fk`, 500). Found by `api/import.spec.ts` on its first real run,
   root-caused with a direct repro (`POST /school/import` → 500 with the FK detail) and a planner dump,
   fixed with a separate `createdProfile()` path that receipts profile rows under their own collection
   without touching the flat map, and locked down by the new planner test "keeps the user id when a
   profile shares the user's local id".

## Deviations from the plan

- **Capture helper names.** The plan named `readPendingSnapshot` / `archivePendingSnapshot` /
  `clearPendingSnapshot`; the module uses `readPendingImport` / `archivePendingImport` /
  `clearPendingImport` to match the key names and the UI language. Same behavior and exports.
- **Password hashing location.** P2.1 put `hashPassword` inside `applyImportPlan`; the route hashes
  once per request and passes `defaultPasswordHash` into the planner, so tests stay pure and one
  import costs one hash.
- **Validation status.** The plan mentioned 422 with the warning list; validation failures return the
  app's standard 400 `VALIDATION_ERROR` (zod) because that is the shared error shape. Warnings are
  returned with 200/201 results, which is where they are actionable.
- **Admin gate on the UI.** The tab renders for `isApiDataMode()` rather than an explicit role check,
  because `AdminSettings` is only reachable from the admin navigation; the server is the real gate.
- **Receipt gate.** C12 was not covered by the planned spec shape, so the spec now downloads the
  receipt through the real button and compares it with the response.
- **Extra planner test.** The plan asked for planner tests; the collision fix added a 13th one.

## Test Gate Outcomes

| Contract item | Gate | Result | Evidence |
|---|---|---|---|
| C1 Demo mode unchanged | `npm run e2e` (demo) | PASS | demo regression 1/1 in both final runs; demo still uses `lumina-school:v1` |
| C2 API mode never writes `v1` | `api/cache-keys.spec.ts` + `api/import.spec.ts` | PASS | `v1` byte-identical across an API login and across a full import; `api-cache` present, `cache-owner` = `admin@lumina.school` |
| C3 Capture works | `api/cache-keys.spec.ts` | PASS | `pending-import.sourceSeededAt` = fixture `seededAt`, `recordCount > 0`, reload does not replace it; UUID-only payload not captured |
| C4 Preview is read-only | `api/import.spec.ts` | PASS | bootstrap lesson count and marker unchanged after preview; no uploads in preview (`pendingUploads` reported instead) |
| C5 History preserved | `api/import.spec.ts` + 13 planner tests | PASS | `endTime 09:25`, `createdAt` exact, `createdBy` = imported student, request `approved` with attachment, credit balance 4 |
| C6 Seed filter | planner tests + `diffAgainstSeed` | PASS | excluded seed rows counted as `skippedSeed`; `includeSeedRecords` imports them |
| C7 Idempotency | `api/import.spec.ts` | PASS | repeat 409; forced run 201 with no extra lessons |
| C8 Attachment bytes | `api/import.spec.ts` | PASS | download byte-identical to the seeded PDF body; bytes uploaded through `POST /uploads` |
| C9 Admin only | `api/import.spec.ts` | PASS | anonymous 401; manager/teacher/student 403 |
| C10 No destructive DB work | grep gate + `git diff --stat` | PASS | only `warningsTruncated` matches `truncate`; no `.env*` change; no reset/push/seed call added |
| C11 Repo gates | typecheck, lint, backend tests, smoke, e2e x2 | PASS | see the table below |
| C12 Receipt is usable | `api/import.spec.ts` | PASS | receipt parses, `marker`/`totals`/`createdIds` equal the response, id count = `totals.created` |
| C13 Docs match reality | five docs read after the run | PASS | keys, routes, commands, counts, and residue match the code |

### Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | exit 0 (both workspaces) |
| Lint | `npm run lint` | exit 0 (both workspaces) |
| Backend tests | `npm run test --workspace @lumina/backend` | 5 files, 30 tests, all pass |
| Smoke | `npm run smoke` | 13/13 domains, 343 checks, settings restored (24 h, refunds on) |
| Browser suite, run 1 | `npm run e2e` | 13 API pass (49.2 s) + 1 demo pass (9.2 s), exit 0 |
| Browser suite, run 2 | `npm run e2e` | 13 API pass (50.3 s) + 1 demo pass (9.2 s), exit 0, no cleanup between runs |
| Whitespace | `git diff --check` | exit 0 |

## Residue left in the dev database

Everything below is created by `api/import.spec.ts` on purpose (there is no delete API) and carries a
unique `runId`; the D1 rows are also still present. Counted after the final two full runs:

| Row | Count | Marker |
|---|---|---|
| imported students (+ `student_profiles`) | 6 | email `import-<runId>@lumina.school`, password `Password123!` |
| courses (+ unit, lesson plan, enrollment) | 6 | title `Import fixture course <runId>` |
| lessons | 6 | `2031-03-05` 09:00-09:25, `ESL-IMPORT` |
| approved cancellation requests | 6 | `review_note = 'Approved before the cutover'` |
| credits | 6 | description `Import fixture credits <runId>`, 4 hours `purchase` |
| attachments | 7 | `import-fixture.pdf` (the extra one was uploaded by the first attempted run, whose import failed on the FK bug before the transaction committed) |
| `activity` rows `school.imported` | 12 | one per import plus one per forced re-run |

A disposable test database is still the only real fix; the smoke suite has the same gap.

## Reported, not fixed

- **`next/image` blob warning (pre-existing).** The manager cancellation modal logs
  `Image with src "blob:..." has either width or height modified, but not the other`. Cosmetic, same
  finding as D1; unrelated to the import.
- **Bell title for the new action.** `school.imported` renders through `prettify()` as
  "School imported" in category `plans` and navigates to Overview. The activity filter already files
  it under Settings. Cosmetic; a one-line `ACTION_TITLES` entry plus a `school` family rule in
  `navFor` would make the bell point at the Settings page.
- **`frontend/AGENTS.md` churn.** `next dev` removed the `nextjs-agent-feedback` block from the
  working tree during the Playwright runs (same as D1). Restored with `git checkout` and left out of
  the commits.

## Handoff

- Plan: this folder (`completed/d2-one-time-import_19-11-26/`), all P1-P4 boxes ticked.
- Report: this file.
- Update-process record: `d2-one-time-import_REPORT_19-11-26.md` in this folder.
- Next: **D3** (remove the browser-store fallback from the production path, keeping
  `NEXT_PUBLIC_DATA_SOURCE=local` for one release). Start it with a fresh PLAN.
- Committed: five self-contained commits on `developing` (`1f52ba7` store-key split, `c1adaf1`
  import core, `473e751` admin tab, `9070995` e2e proof, `2869049` docs).
