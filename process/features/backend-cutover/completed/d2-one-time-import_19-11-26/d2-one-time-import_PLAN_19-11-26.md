---
name: plan:d2-one-time-import
description: "COMPLEX plan: one-time, admin-only import of a browser's lumina-school:v1 snapshot (plus its attachment bytes) into PostgreSQL with full history preserved"
date: 19-11-26
feature: backend-cutover
status: COMPLETE (EXECUTE + UPDATE PROCESS done 19-11-26; archived)
---

# D2 — One-Time Import into PostgreSQL

```yaml
context-envelope:
  feature: backend-cutover
  phase: PLAN
  session-goal: Import a browser's local school (records plus file bytes) into Postgres without losing history, duplicating the demo seed, or breaking demo mode
  branch: developing
  worktree: main
  context-group: database, auth, tests, uxui
  blast-radius-packages: frontend/app/lib/school, frontend/app/components/admin, backend/src/routes, backend/src/lib, frontend/e2e, backend/tests
  active-plan: this file
  research: d2-one-time-import_RESEARCH_19-11-26.md (same folder)
  test-runner: vitest | npm run e2e | npm run smoke
  validate-contract: this file, section "Validate Contract"
```

**Date**: 19-11-26
**Status**: COMPLETE — executed 19-11-26; all 13 Validate Contract rows green, report in `d2-one-time-import_EXECUTE_19-11-26.md`.
**Complexity**: COMPLEX (storage-key migration, a new admin API surface, a new admin UI, history-preserving inserts, two run modes that must stay independent)
**Branch**: developing
**Umbrella**: `frontend/CUTOVER_PLAN.md` §Step D item 2 ("one-time import of local data") and `frontend/CUTOVER_PROGRESS.md` board row "D2".
**Execution Model**: single vc-execute-agent, sequential: P1 store-key split + capture (frontend only), P2 backend import core, P3 admin import UI, P4 verification and docs.

TL;DR: The import is built as **one admin-only bulk endpoint plus a pre-login-safety capture**, not as a script driving the existing endpoints — the existing endpoints cannot set `createdAt`, `createdBy`, `actorId`, review state, or `endTime`, and `POST /bookings` / `POST /lessons/:id/absence` would fabricate credit movements. Two structural changes make it safe: (1) API mode's offline cache moves from `lumina-school:v1` to `lumina-school:api-cache`, so the local store is no longer destroyed on the first API sign-in; (2) a boot-time capture copies the local snapshot to `lumina-school:pending-import` so a browser that already ran an older API build is still recoverable. Attachment bytes travel through the existing `POST /uploads` first; the bulk payload carries only a `localAttachmentId → serverAttachmentId` map, so no body-limit or multipart change is needed for files.

## Overview

Umbrella Step D item 2 says "one-time import of local data". The research phase established that the naive reading — replay the local store through the existing REST endpoints — loses the history that makes the data worth importing: every timestamp, every actor, every resolved request, the real `endTime`, and the credit ledger. It also cannot complete inside the global 300 req/min rate limit and would pollute the admin activity feed with fabricated events.

D2 therefore delivers three things:

1. **A storage guarantee.** From this release on, API mode never writes `lumina-school:v1`. The local store survives the cutover, which is also the precondition for D3 (fallback removal) being safe.
2. **A server import contract.** `POST /school/import/preview` and `POST /school/import` accept a `SchoolData`-shaped payload, remap every local slug id to a fresh UUID in one transaction, and insert rows with their original timestamps and actors.
3. **An admin surface.** A third tab in `AdminSettings` ("Import") that previews the pending local snapshot, imports it, and hands back a receipt file.

## Goals

- Demo/local mode behaves exactly as today: same key, same seed, same flows.
- API mode no longer overwrites local data, and the local snapshot is additionally copied to a recovery key before any API bootstrap can touch it.
- An admin can preview counts, drops, and warnings before writing, then import in one atomic request.
- Imported history is faithful: `createdAt`, `createdBy`, `actorId`, request `status`/`reviewedBy`/`reviewedAt`, lesson `endTime`, and the credit ledger keep their original values and keep their original sign.
- Re-running the same import is refused unless explicitly forced.
- The import never resets, truncates, migrates, or seeds the database.
- Every import produces a downloadable receipt listing every created server id, so a mistake can be cleaned up manually.

## Scope

**In scope**

- `frontend/app/lib/school/store.ts` + `api/bootstrap.ts`: API cache key split.
- `frontend/app/lib/school/import/**` (new): capture, seed diff, payload build, attachment upload, receipt.
- `frontend/app/lib/school/api/import.ts` (new): typed calls to the two new endpoints.
- `frontend/app/components/admin/AdminSettings.tsx`: new "Import" tab (API mode only).
- `frontend/app/components/LuminaApp.tsx`: capture call before the bootstrap effect.
- `backend/src/lib/school-import.ts` (new): zod payload schema, pure planner, transactional applier.
- `backend/src/routes/school-import.ts` (new) + `backend/src/routes/index.ts`: routes under `/api/v1/school`.
- `backend/src/lib/activity.ts`: add `school.imported` to `ActivityAction`.
- `backend/tests/school-import.test.ts` (new): pure planner tests, no database.
- `frontend/e2e/api/import.spec.ts` (new): capture → login → preview → import → verify → refuse re-run.
- Docs: `frontend/PROGRESS.md`, `frontend/CUTOVER_PROGRESS.md` (D2 row), `frontend/CUTOVER_PLAN.md` (Step D item 2 note), `process/context/all-context.md`, `process/context/tests/all-tests.md`.

**Out of scope**

- D3: deleting the local store fallback, removing the demo seed from the production path, retiring `NEXT_PUBLIC_DATA_SOURCE=local`. The flag stays for one release.
- Any schema/migration change. The import writes existing tables only.
- A general export/backup feature; the receipt is an id list, not a data dump.
- Fixing product bugs found on the way. They get reported, not silently fixed.
- Importing notification bell state (per-account, derived on the server).

## Decisions

- **D1 Cache key split, not a capture-only fix.** `hydrateSchool()` currently saves to whatever adapter `store.ts` owns — `lumina-school:v1` — which is the exact write that destroys local data (`store.ts:138-143`). The API cache moves to `lumina-school:api-cache`; `v1` stays the local-mode store. This removes the failure mode instead of racing it.
- **D2 Capture is defence in depth.** A browser that ran an older API build already lost `v1`; nothing can recover that. A browser upgrading from this release keeps it. Capture therefore only helps the transition window, and is cheap: copy `v1` to `lumina-school:pending-import` when it looks local.
- **D3 "Looks local" is decided by id shape.** Every server primary key is a UUID; every local id is `${prefix}-${base36time}-${counter}` (`repositories.ts`) or a hand-written slug (`seed.ts`). A snapshot with at least one non-UUID record id is a local store; a snapshot with only UUID ids is a previous API cache and must not be imported.
- **D4 One bulk endpoint, two modes via `dryRun`.** `POST /school/import/preview` and `POST /school/import` share one zod schema and one pure planner so a preview can never disagree with the real run. Preview performs zero writes.
- **D5 Bytes go through `POST /uploads`.** The client converts each pending attachment's data URL to a `File` and uploads it with the existing authenticated endpoint (5 MB / type rules already enforced). The bulk payload carries `attachments: { [localId]: serverAttachmentId }` and the attachment rows are then adopted, not re-inserted. This avoids base64 in JSON and avoids touching the multipart config.
- **D6 Seed filter is client-declared, per record.** The client owns `createSeedSchool()`, so it computes the exclusion set by canonical-JSON comparison with the seed and sends `exclude: { <collection>: [ids] }` plus `includeSeedRecords` to disable it. The server never needs the frontend seed module at runtime, and the preview shows exactly what will be excluded.
- **D7 Users and profiles are adopted by email, never seed-filtered.** `users.email` is unique, and the server seed already holds the demo identities. A local user whose email exists becomes that server user (no profile overwrite); a new email is inserted with `Password123!`, matching `api/school.ts:18`. This is what keeps imported lessons and credits referenceable — filtering seeded users would orphan every record that points at them.
- **D8 Drops are explicit, never silent.** A record whose required parent is excluded (for example a user-created lesson pointing at a skipped seeded enrollment) is dropped with a warning; an optional reference to an excluded record (for example `lessonPlanId`) is nulled with a warning. Nothing is dropped without appearing in `warnings` and in the receipt.
- **D9 Settings are not imported by default.** A local settings blob can disagree with school-wide rules other accounts already rely on. The UI exposes an opt-in checkbox; the server applies it only when `importSettings: true`.
- **D10 Idempotency is an activity marker.** On success the server writes one row: `action: "school.imported"`, `targetType: "school"`, `targetId: <source.seededAt>`. A repeat import with the same marker returns `409 CONFLICT` unless `force: true`. No table, no migration, and the marker is visible in the existing Activity tab.
- **D11 Import is one transaction.** All inserts run inside `app.db.transaction` (same pattern as `bookings.ts:200`). A failure rolls back the entire import; there is no half-imported school.
- **D12 Imported rows are not tagged.** Instead the response returns `idMap` + `createdIds` and the UI offers a JSON receipt download, so an operator can delete a bad import by id. Adding an `import_batch` column would require the migration D2 explicitly avoids.
- **D13 Route-scoped body limit.** The payload is metadata only, but a large local school can exceed Fastify's default 1 MiB. The two import routes opt into `bodyLimit: 8 * 1024 * 1024`; no global limit changes.
- **D14 Admin only.** `app.requireRole("admin")`, matching `POST /users` and `PATCH /settings`. Managers keep the local data but cannot push it into the shared school.

## Architecture Notes

```
browser (API mode)                                  backend
──────────────────                                  ───────
LuminaApp mount
  └─ captureLocalSnapshot()          (sync, idempotent)
       lumina-school:v1 ──copy──▶ lumina-school:pending-import
  └─ loadSchoolFromApi(email)
       GET /school/bootstrap ──▶ hydrateSchool() ──▶ lumina-school:api-cache
                                          (v1 untouched)

AdminSettings → Import tab
  └─ readPendingSnapshot()
  └─ diffAgainstSeed()  ──▶ exclude map + counts
  └─ POST /school/import/preview  ──▶ counts, drops, warnings   (no writes, no uploads)
  └─ POST /school/import:
       for each pending attachment with bytes:
         dataUrl → File → POST /uploads ──▶ { id, storageKey }   (map localId → serverId)
       then one transaction:
                                         1. marker check (school.imported)
                                         2. plan: local slug → UUID, topo order
                                         3. insert users (adopt by email) / profiles
                                         4. courses → units → plans → enrollments
                                         5. lessons → slots/requests/absences/ratings
                                         6. assignments → credits → activity
                                         7. logActivity(school.imported)
                                     ◀── counts, idMap, warnings
  └─ write receipt JSON, archive pending, clear pending
```

New storage keys:

| Key | Owner | Purpose |
|---|---|---|
| `lumina-school:v1` | local mode only | the demo/local school, never written in API mode |
| `lumina-school:api-cache` | API mode only | last good `/school/bootstrap` payload (offline fallback) |
| `lumina-school:cache-owner` | API mode only | email that owns `api-cache` (existing key, unchanged semantics) |
| `lumina-school:pending-import` | import | captured local snapshot awaiting import |
| `lumina-school:imported:<seededAt>` | import | read-only archive kept after a successful import |

## Data Mapping Contract

| Collection | Table | Identity rule | Preserved verbatim |
|---|---|---|---|
| `users` | `users` | email match → adopt; else insert with `Password123!` | `name`, `role`, `status`, `createdAt`; `avatarColor` name → hex |
| `teacherProfiles` | `teacher_profiles` | adopt when the user was adopted | `managerId`, `headline`, `specializations`, `languages`, `bio`, `hireDate`, `weeklyGoalHours` |
| `studentProfiles` | `student_profiles` | adopt when the user was adopted | `managerId`, `level`, `targetLevel`, `goal`, guardian fields |
| `courses` / `courseUnits` / `lessonPlans` | same names | always new UUIDs | `ownerId`, `status`, `createdAt`, `updatedAt`, ordering, `attachmentIds` (remapped) |
| `attachments` | `attachments` | adopt from the upload map | `name`, `type`, `size`, `storageKey`, `uploadedBy`, `uploadedAt` |
| `enrollments` | `enrollments` | always new | `status`, `nextPlanIndex`, `startedAt` |
| `lessons` | `lessons` | always new | `date`, `time`, `endTime`, `status`, `roomCode`, `notes`, `homework`, `attendance`, `feedback`, `scores`, `corrections`, `cancelReason`, `createdBy`, `createdAt` |
| `slotOpenings` | `slot_openings` | always new | `openedAt`, `openedBy` |
| `requests` | `requests` | always new | `type`, `status`, `requestedAt`, `requestedBy`, `reviewedAt`, `reviewedBy`, `reviewNote`, `attachmentId` |
| `absences` | `absences` | always new | `reportedAt`, `reportedBy` (no credit is created) |
| `ratings` | `ratings` | always new | `from`, `authorId`, `authorName`, `score`, `comment`, `createdAt` |
| `assignments` | `assignments` | always new | `status`, `response`, `submittedAt`, `feedback`, `grade`, `reviewedAt`, `createdAt` |
| `credits` | `credit_entries` | always new | `hours` (sign kept), `amount`, `reason`, `description`, `lessonId`, `actorId`, `createdAt` |
| `activity` | `activity` | always new | `action`, `targetType`, `targetId`, `summary`, `createdAt` |
| `settings` | `settings` | row 1, opt-in only | all seven keys |

`avatarColor` map: `mint → #10b981`, `peach → #f97316`, `lavender → #8b5cf6`, `indigo → #6366f1`, existing `#RRGGBB` passes through, unknown values fall back to `#6366f1`. The names come from `seed.ts` / `data.ts`; the hex values match the backend seed and `users.avatarColor`.

## Touchpoints

New: `frontend/app/lib/school/import/{capture,map,run,receipt}.ts`, `frontend/app/lib/school/api/import.ts`, `backend/src/lib/school-import.ts`, `backend/src/routes/school-import.ts`, `backend/tests/school-import.test.ts`, `frontend/e2e/api/import.spec.ts`.

Modified: `frontend/app/lib/school/store.ts`, `frontend/app/lib/school/api/bootstrap.ts`, `frontend/app/lib/school/index.ts`, `frontend/app/components/LuminaApp.tsx`, `frontend/app/components/admin/AdminSettings.tsx`, `backend/src/routes/index.ts`, `backend/src/lib/activity.ts`, `frontend/PROGRESS.md`, `frontend/CUTOVER_PROGRESS.md`, `frontend/CUTOVER_PLAN.md`, `process/context/all-context.md`, `process/context/tests/all-tests.md`.

Read-only references: `frontend/app/lib/school/{types,seed,repositories,files}.ts`, `backend/src/db/schema.ts`, `backend/src/lib/{password,activity}.ts`, `backend/src/routes/uploads.ts`, `frontend/e2e/support/{api,preconditions}.ts`.

## Public Contracts

| Contract | Shape | Consumers |
|---|---|---|
| Store keys | `lumina-school:v1` = local only; `lumina-school:api-cache` = API cache | demo mode, offline fallback, e2e demo spec |
| `POST /api/v1/school/import/preview` | admin, `{ source, attachments, exclude, options }` → counts/drops/warnings, no writes | admin UI, e2e |
| `POST /api/v1/school/import` | same body → 201 `{ counts, idMap, createdIds, marker, warnings }`; 409 on a repeated marker unless `force` | admin UI, e2e |
| Marker | one `activity` row `school.imported` / `targetType: "school"` / `targetId: <seededAt>` | idempotency check, Activity tab |
| Receipt | JSON blob `{ marker, sourceSeededAt, exportedAt, counts, idMap }` | manual rollback |
| Non-contract | import never runs in demo mode, never overwrites profiles, never rescales credit signs, never seeds or resets |
| Rollback flag | `NEXT_PUBLIC_DATA_SOURCE=local` keeps working for one release (D3 removes it) | release safety |

## Blast Radius

- **Frontend storage**: two new keys and one changed write target. Every API mode screen reads through the store, so a wrong key shows an empty school — covered by the existing API e2e specs plus the new cache-key assertion.
- **Demo mode**: untouched by design; `SCHOOL_STORAGE_KEY`, seeding, legacy workspace merge, and `resetSchool` keep their behavior. Proven by the demo regression spec.
- **Backend**: one new route file, one new lib file, one union member. No schema or migration change; imports write existing tables and can be deleted by id.
- **Database**: a successful import adds rows permanently (no delete API). Mitigated by preview, the 409 marker, and the receipt.
- **Developer workflow**: `npm run e2e` gains one spec that leaves identifiable residue in the dev database, documented like D1's residue.

## Implementation Checklist

### P1 Store-key split and capture (frontend only)
- [x] P1.1 `store.ts`: export `API_CACHE_KEY = "lumina-school:api-cache"`; keep `SCHOOL_STORAGE_KEY` for local mode; make `hydrateSchool` save to `api-cache` when `dataSource === "api"` and to `v1` otherwise; add a comment naming the destroyed-data bug this closes.
- [x] P1.2 `api/bootstrap.ts`: build the cache adapter on `API_CACHE_KEY`, import the constant from `store.ts`, update the file comment.
- [x] P1.3 `import/capture.ts`: key constants, `looksLikeLocalSnapshot(raw)` (version 3, `seededAt` present, ≥1 record, ≥1 non-UUID id), `captureLocalSnapshot()` (idempotent, never overwrites an existing pending copy, wrapped in try/catch so storage errors never break boot), `readPendingSnapshot()`, `archivePendingSnapshot()`, `clearPendingSnapshot()`.
- [x] P1.4 `LuminaApp.tsx`: call `captureLocalSnapshot()` synchronously in the API bootstrap effect before `loadSchoolFromApi`; also call it defensively at the top of `loadSchoolFromApi` (both are idempotent).
- [x] P1.5 `school/index.ts`: export the new capture helpers that the UI needs.
- [x] P1.6 Assert the guarantee: extend `frontend/e2e/api/auth.spec.ts` (or add `api/cache-keys.spec.ts`) so an API login proves `lumina-school:v1` is byte-identical before/after and `lumina-school:api-cache` now exists.
- [x] P1.7 `npm run typecheck`, `npm run lint`, `npm run e2e` — demo regression must stay green.

### P2 Backend import core
- [x] P2.1 `backend/src/lib/school-import.ts`: zod schema mirroring `SchoolData` v3 (all 16 collections, `version: 3` literal, ISO timestamps, `exclude` map, `options`), `buildImportPlan(payload, existing)` (pure: id map, adopt-by-email, seed exclusions, FK topological order, drop/null warnings), `applyImportPlan(tx, plan)` (batched inserts, `hashPassword` for new users, avatar map, marker write).
- [x] P2.2 `backend/src/routes/school-import.ts`: `POST /import/preview` and `POST /import` with `preHandler: app.requireRole("admin")`, `bodyLimit: 8 * 1024 * 1024`, 409 on marker conflict unless `force`, 422 with the warning list when validation fails.
- [x] P2.3 `backend/src/routes/index.ts`: register with `prefix: "/school"` next to `schoolRoutes`; confirm no route collision with `GET /school/bootstrap`.
- [x] P2.4 `backend/src/lib/activity.ts`: add `"school.imported"` to `ActivityAction`; confirm `AdminSettings` category matching already routes `school.*` to "Settings" (`AdminSettings.tsx:18`).
- [x] P2.5 `backend/tests/school-import.test.ts`: pure planner tests only, no database — id remap, adopt-by-email, seed exclusion on/off, optional-ref nulling vs required-parent drop, avatar mapping, credit sign preservation, timestamp passthrough, marker detection.
- [x] P2.6 `npm run test --workspace @lumina/backend` green.

### P3 Admin import UI
- [x] P3.1 `api/import.ts`: `previewImport(payload)` / `runImport(payload)` typed wrappers over `request()`.
- [x] P3.2 `import/run.ts`: read pending snapshot, diff against `createSeedSchool()` with a stable `canonicalJson`, convert pending attachment data URLs (`readFileAsync` over `idb:` and `lumina-school-file:`) to `File`s, upload them, build the payload with `exclude` + `attachments`, and call preview/import.
- [x] P3.3 `AdminSettings.tsx`: third tab "Import", rendered only when `isApiDataMode()` and the user is an admin. Shows captured-at, record counts, excluded seed counts, per-item warnings, `includeSeedRecords` + `importSettings` checkboxes, a "Refresh capture from local store" action, and a `Preview` → `Import` flow.
- [x] P3.4 On success: archive `pending` to `lumina-school:imported:<seededAt>`, clear `pending`, offer the receipt download, surface the server counts, and point at the Activity tab (the marker row).
- [x] P3.5 Empty state ("No pending local data on this browser") and failure state (shows the server error, keeps `pending` intact so the import can be retried).

### P4 Verification and docs
- [x] V1 `frontend/e2e/api/import.spec.ts`: inject a synthetic local snapshot via `addInitScript` before any app code runs, sign in as admin, preview (asserts "no writes" by comparing bootstrap counts), import, then assert through `/school/bootstrap` that appointments/timestamps/actors survive, the marker row exists, and a second import is refused.
- [x] V2 `npm run e2e` twice consecutively; capture timings and artifact paths.
- [x] V3 `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`, `npm run smoke`.
- [x] V4 Safety gates: grep changed files for `db:reset`, `reset`, `truncate`, `push`; confirm no `.env` / `.env.local` / `backend/.env` change in `git diff --stat`.
- [x] V5 Docs: `frontend/PROGRESS.md`, `frontend/CUTOVER_PROGRESS.md` (D2 row + verification rows), `frontend/CUTOVER_PLAN.md` (Step D item 2 note incl. the key split), `process/context/all-context.md` (storage keys + import contract), `process/context/tests/all-tests.md` (new spec, command, last green).
- [x] V6 Report in this folder: per-phase results, the residual rows the spec leaves in the dev database, and any product bug found (reported, not fixed).

## Acceptance Criteria

| Umbrella item | Proving gate |
|---|---|
| "One-time import of local data" exists | `POST /school/import` + admin Import tab, proven by `api/import.spec.ts` |
| Local data is not destroyed before it can be imported | `v1` untouched by API mode (P1.6) + capture to `pending-import` (P1.3) |
| Imported history is faithful | C5 assertions on `createdAt`/`createdBy`/`endTime`/request state/credit sign |
| No duplicated demo school | C6 default seed filter + preview counts |
| Repeat runs cannot double data | C7 marker → 409 |
| Demo mode still works | demo regression spec + no `lumina-school:v1` behavior change |
| D3 is unblocked | D2 keeps the local store and the `NEXT_PUBLIC_DATA_SOURCE=local` flag |

## Validate Contract

| Contract item | Command / probe | Pass condition |
|---|---|---|
| C1 Demo mode unchanged | `npm run e2e` (demo config) | demo regression green; `lumina-school:v1` still the demo store |
| C2 API mode never writes `v1` | `api/import.spec.ts` or `api/cache-keys.spec.ts` | `v1` byte-identical across an API login; `lumina-school:api-cache` present |
| C3 Capture works | Playwright with a synthetic local payload | `pending-import` exists and equals the seeded payload; a second boot does not overwrite it |
| C4 Preview is read-only | two preview calls + bootstrap comparison | counts identical, no new rows, no marker |
| C5 History preserved | import fixture + `GET /school/bootstrap` | lesson `createdAt`/`createdBy`/`endTime`, request `approved` + `reviewedAt`, credit `hours` sign and `createdAt` all match the payload |
| C6 Seed filter | preview with default and with `includeSeedRecords: true` | default excludes every seed-identical record; the flag includes them |
| C7 Idempotency | import twice with the same `seededAt` | second call returns 409; with `force: true` it returns 201 and adds a second marker |
| C8 Attachment bytes | admin downloads the imported attachment | bytes byte-identical to the source data URL, and `attachments.storageKey` unique |
| C9 Admin only | call both routes unauthenticated / as manager / teacher / student | 401 then 403; no writes |
| C10 No destructive DB work | grep gate over changed files + `git diff --stat` | no reset/truncate/push/seed call; no `.env*` edits |
| C11 Repo gates stay green | `npm run typecheck`, `npm run lint`, backend tests, `npm run smoke`, `npm run e2e` ×2 | all exit 0 |
| C12 Receipt is usable | download the receipt after a run | valid JSON listing every created id, matching `createdIds` in the response |
| C13 Docs match reality | read the five docs from V5 | keys, routes, commands, and residue notes match the code |

## Verification Evidence

| Gate | Strategy | Command |
|---|---|---|
| Static | Fully-Automated | `npm run typecheck`, `npm run lint` |
| Backend unit (pure planner) | Fully-Automated | `npm run test --workspace @lumina/backend` |
| Backend smoke | Fully-Automated | `npm run smoke` |
| Endpoint + admin flow | Hybrid | `npm run e2e` → `api/import.spec.ts` |
| Demo regression | Hybrid | `npm run e2e` → demo config |
| Data fidelity | Hybrid | import fixture then `GET /school/bootstrap` assertions |
| Idempotency | Fully-Automated | repeat POST, expect 409 |
| Byte fidelity | Hybrid | upload → import → download → buffer compare |
| Safety | Agent-Probe | grep gate + `git diff --stat` review |
| Docs | Agent-Probe | V5 checklist |

## Dependencies and Sequencing

P1 before P2: the endpoint is only safe once API mode stops writing `v1`, and the e2e spec in P2 asserts through that key split. P2 before P3: the UI needs the response contract and the preview semantics. P4 last, after counts are real. Within P2, the pure planner (P2.1/P2.5) lands before the routes so the transaction body is already tested. No dependency is added to either workspace.

## Risks

- **Irreversible rows.** Imports persist and there is no delete API. Mitigation: preview first, 409 marker, receipt with every id, one transaction so a failure leaves nothing behind.
- **Seed diff false negatives.** A user who edited a seeded record makes it non-identical, so it imports as a duplicate. Mitigation: the preview lists excluded counts and per-collection "modified" warnings; `includeSeedRecords` is the escape hatch; documented in the UI.
- **Dropped references surprise the admin.** A user-created lesson pointing at a skipped seeded enrollment is dropped. Mitigation: warnings are counted per collection and shown before the import, and the receipt records them.
- **Attachment size/type drift.** A local file over 5 MB or of an unaccepted type cannot be uploaded. Mitigation: skip with a warning, keep the metadata out, and never produce a 404-ing attachment.
- **Body size.** A very large local school could exceed even 8 MiB. Mitigation: route-scoped limit with a clear 413 message, and the client strips excluded seed records before sending.
- **Two implementations of the mapper.** Client builds `exclude`; server builds the plan. Mitigation: the server's plan is authoritative and returns what it actually did; the client never reports a count it computed itself.
- **Test residue.** The import spec creates permanent rows. Mitigation: a unique `runId` in titles/emails, receipt captured in the report, residue documented like D1.
- **Hidden dependency on demo seed shape.** `createSeedSchool()` changing silently changes what is excluded. Mitigation: the exclusion logic lives next to the seed, the preview shows the excluded count, and the e2e spec fixes a synthetic payload rather than relying on the live seed.

## Phase Completion Rules

- A phase is not complete while any checklist box is open or any Validate Contract row is red.
- P1 is not complete until the demo regression spec passes *and* C2 passes — the key split must be provably non-destructive in both directions.
- P2 is not complete until the pure planner tests pass and a real preview returns zero writes (C4).
- P3 is not complete until the Import tab works end to end on a seeded database, including the failure state leaving `pending` intact.
- P4 is not complete until `npm run e2e` passes twice consecutively.
- Any discovered product bug is reported in the plan/report and is not fixed inside D2 without explicit approval.
- Docs are part of the phase, not follow-up work.
- No phase may run `db:reset`, `db:push`, `truncate`, or edit `.env*`; a precondition failure is reported, never repaired.

## Assumptions the User Can Override

1. **Imported new users get `Password123!`**, matching the existing API-mode default (`api/school.ts:18`). Alternative: skip local-only users and re-invite them.
2. **Modified seeded records import as new rows by default**, which can duplicate demo fixtures. Alternative: make `includeSeedRecords: false` stricter (drop anything whose id starts with a known seed prefix, even if edited).
3. **School-wide settings are not imported by default.** Alternative: import them unconditionally.
4. **Attachment files over 5 MB or of an unaccepted type are skipped**, not raised to a larger limit.
5. **Managers cannot import.** Alternative: allow a manager to import their own team's local data.
6. **The import runs from the admin screen in API mode.** A pre-login screen is not built, because the key split already keeps the data alive.

## Resume and Execution Handoff

Status: COMPLETE and archived (19-11-26). All P1-P4 checklist boxes are ticked and every gate is
green; the execution record is `d2-one-time-import_EXECUTE_19-11-26.md` (same folder), research in
`d2-one-time-import_RESEARCH_19-11-26.md`. This plan is a historical contract; do not resume it.

- Execution order used: P1 → P2 → P3 → P4, with the profile/user id collision found and fixed during P4.
- Registered deviations (capture helper names, password hash location, 400 vs 422 validation, UI gate,
  receipt gate, 13th planner test) are listed in the execute report.
- Regression commands that were kept green: `npm run typecheck`; `npm run lint`;
  `npm run test --workspace @lumina/backend`; `npm run smoke`; `npm run e2e` (twice back to back).

## Next Step

D2 is closed. The next lane is **D3 — fallback removal** (`frontend/CUTOVER_PLAN.md` §Step D item 3):
stop reading the browser store on the production path, keep `NEXT_PUBLIC_DATA_SOURCE=local` as the
documented rollback flag for one release, and leave the local store as the import source until the
flag is removed. Open D3 with a new PLAN; this archived plan needs no further work.
