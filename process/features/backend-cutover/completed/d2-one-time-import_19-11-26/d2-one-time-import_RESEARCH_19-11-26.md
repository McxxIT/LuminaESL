---
name: research:d2-one-time-import
description: "RESEARCH: how a browser's lumina-school:v1 data and its file bytes can be imported into PostgreSQL without losing history or duplicating the seeded school"
date: 19-11-26
feature: backend-cutover
status: RESEARCH COMPLETE
---

# D2 - One-time import from the browser store into PostgreSQL

```yaml
context-envelope:
  feature: backend-cutover
  phase: RESEARCH
  session-goal: Establish what a one-time local-to-Postgres import must move, what the current API can carry, and what it cannot
  branch: developing
  worktree: main
  context-group: database, auth, tests, uxui
  blast-radius-packages: frontend/app/lib/school, backend/src/routes, backend/src/db, frontend/e2e
  active-plan: none (D2 has no plan yet)
  test-runner: vitest | npm run e2e
  validate-contract: none yet
```

TL;DR: The local store can be read and mapped, but **the public API cannot carry an import without
losing history**: no endpoint can set `createdAt`, `createdBy`, `actorId`, request review state, or
activity rows, `POST /bookings` charges a credit, `POST /lessons/:id/absence` refunds one, and
`POST /requests` only ever creates `pending`. There is also a hard time limit: the first API-mode
sign-in overwrites `lumina-school:v1` with the scoped API payload, so the local snapshot is destroyed
before any admin could click an import button. File bytes live in two places (IndexedDB **and**
localStorage), not one. Three import shapes are technically viable (client-driven per endpoint, one
bulk server endpoint, or a direct-DB operator script); the evidence favours a bulk server endpoint,
with the local snapshot first copied to a dedicated recovery key.

## Scope and Blast Radius

In scope (research only, nothing changed):

- `frontend/app/lib/school/{store,adapter,files,migrate,seed,types,repositories}.ts` - what the local
  payload is, where the bytes are, how ids are generated.
- `frontend/app/lib/school/api/bootstrap.ts` and `frontend/app/components/LuminaApp.tsx` - the API
  read path and when it overwrites the local key.
- `backend/src/db/schema.ts`, `backend/src/routes/*.ts`, `backend/src/app.ts`,
  `backend/src/config/env.ts` - the write surface, its constraints, and its limits.
- `frontend/app/components/admin/AdminSettings.tsx` - the only admin surface with no import control.

Out of scope for D2 (kept for D3): deleting the browser-store fallback, removing duplicated seed
data from the production path, and the `NEXT_PUBLIC_DATA_SOURCE=local` rollback flag.

## Key Facts

### 1. The local payload is one JSON blob with slug ids

- Key: `lumina-school:v1` (`store.ts:7`). Shape: `SchoolData { version: 3, seededAt, settings,
  collections{16} }` (`types.ts:8`, `store.ts:13-37`).
- Ids are generated locally: `createId(prefix)` returns
  `` `${prefix}-${Date.now().toString(36)}-${counter}` `` (`repositories.ts`). Seeded ids are
  hand-written slugs (`student-mia`, `lesson-grace-3`, `teacher-alex`; `seed.ts:39-48`, `170-225`).
  **No local id is a UUID**, while every server primary key is a UUID
  (`schema.ts:89, 119, 143, 162, 182, 200, 227, 243, 268, 322, 347, 380, 398, 425, 457, 480`).
  Therefore every imported record needs a server id and every reference must be remapped.
- The slug format is a reliable discriminator: a payload whose records carry non-UUID ids is a local
  snapshot, not an API cache.

### 2. The local payload is destroyed on the first API-mode sign-in

- API mode reuses the same key as an offline cache: `createLocalStorageAdapter(SCHOOL_STORAGE_KEY)`
  (`api/bootstrap.ts:20-21`).
- `LuminaApp.tsx:76-95` calls `loadSchoolFromApi(authEmail)` as soon as a session exists; that
  function calls `hydrateSchool(data)` and then `persistCache(email, data)`, which writes the scoped
  bootstrap over `lumina-school:v1` (`api/bootstrap.ts:134-137, 152-157`).
- Consequence: **an import screen that renders after login is already too late.** The local snapshot
  must be copied out of `lumina-school:v1` before the first API bootstrap (or the import must run
  during/ before that effect). `lumina-school:cache-owner` (`api/bootstrap.ts:20, 116-137`) records
  which account owns the cached payload, so a stale local blob is distinguishable from a fresh cache.
- IndexedDB is untouched by this overwrite (`files.ts:61-92` never deletes data), so bytes survive
  while their metadata is lost - which makes them unusable (see fact 3).

### 3. File bytes live in two stores, and only one is IndexedDB

- Cancellation/request evidence: **localStorage** `lumina-school-file:<attachmentId>`, stored as a
  data URL (`files.ts:4, 8, 19-36`; written by `migrate.ts:66-68` and
  `services/uploads.ts`'s synchronous path).
- Lesson-plan uploads: **IndexedDB** database `lumina-files`, object store `files`, key
  `idb:<attachmentId>`, value a data URL (`files.ts:51-58, 61-92`).
- Attachment metadata (`name`, `type`, `size`, `storageKey`) lives only in the JSON `attachments`
  collection (`types.ts`), so losing the JSON orphans the bytes. There is no `deleteDatabase` call
  anywhere in `frontend/app`, so orphaned bytes accumulate silently.
- The umbrella text says "import from `lumina-school:v1` and IndexedDB". **That undercounts the
  scope**: localStorage `lumina-school-file:*` keys must be imported too, or every request-evidence
  attachment is lost without an error.

### 4. Legacy per-user workspaces are already merged, but still present

- `store.ts:80-90` runs `migrateLegacyWorkspaces` on the first local load and sets `migratedAt`.
- It reads `lumina-teacher-workspace:<email>` and `lumina-student-workspace:<email>`
  (`migrate.ts:15-16, 137-151`) and folds lessons, closures, openings, credits and adjustment rows
  into the school collections.
- Those raw keys are never cleared, so an import that reads only `lumina-school:v1` still gets their
  content (already merged); reading them again would double-count.

### 5. The seed is duplicated on both sides, so a pristine local store would duplicate the school

- The frontend seed creates 1 admin, 2 managers, 4 teachers, 12 students, courses, lesson plans,
  lessons, ratings, absences, assignments, credits, slot openings and requests
  (`seed.ts:78-288`).
- The backend seed creates the same demo identities with `Password123!` (`backend/src/db/seed.ts`,
  `DEMO_PASSWORD`), and the same demo lessons/ratings ledger (`:300-350`).
- Both sides are generated fresh in a new browser/DB, so **importing a never-used local store would
  duplicate every demo lesson, rating and credit entry**. Seed rows are identifiable deterministically
  by comparing against `createSeedSchool()` output; a cheap heuristic is `createdAt === seededAt`,
  which holds for seed rows (`seed.ts:170-288`) but not for rows created later.

### 6. The API write surface cannot carry history

| Local collection | Server table | Only write path available | What it cannot preserve |
|---|---|---|---|
| users | `users` | `POST /users` (admin) `users.ts:159-208` | `createdAt` (server default), `avatarColor` must be `#RRGGBB` (`users.ts` schema) while local values are names (`mint`, `peach`, ...), password is caller-supplied (UI always sends `Password123!`, `api/school.ts:18,55`) |
| teacherProfiles | `teacher_profiles` | `PATCH /teachers/:id` (`teachers.ts:149`) | `hireDate` is forced to today by `POST /users` (`users.ts:189`); `PATCH` does not accept it |
| studentProfiles | `student_profiles` | `PATCH /students/:id` (`students.ts:177`) | none material |
| courses/units/plans | `courses`, `course_units`, `lesson_plans` | `POST /courses`, `POST .../units`, `POST .../plans` (`courses.ts:240-560`) | `ownerId` = session user (`courses.ts:240`), `createdAt`/`updatedAt` server-set |
| attachments | `attachments` | `POST /uploads` (bytes+id) or `POST .../plans/:planId/attachments` (metadata only) | `POST /uploads` assigns its own UUID/storageKey (`uploads.ts:40-52`); the plan-attachment route accepts a client UUID and `storageKey` but **writes no bytes** (`courses.ts:609-622`), so `GET /uploads/:id/download` would 404 (`uploads.ts:87-95`). Neither path can attach an arbitrary attachment to a **request** |
| enrollments | `enrollments` | `POST /enrollments` (`enrollments.ts:117`) + `PATCH /enrollments/:id` | `status` cannot be set at insert (defaults `active`); `startedAt` server default |
| lessons | `lessons` | `POST /lessons` then `PATCH /lessons/:id` | no `status`/`notes`/`feedback`/`attendance` on create (`lessons.ts:64-74`); `endTime` is always `time + 25` (`lessons.ts:318`, `LESSON_MINUTES`); `createdBy` = session actor (`:333`); `createdAt` server default; create also auto-attaches a plan and a random room code via `resolveLessonDefaults` (`lib/lesson-defaults.ts:29-88`) |
| slotOpenings | `slot_openings` | `POST /bookings/slots` (`bookings.ts:78`) | `openedBy`/`openedAt` are the session actor/now |
| requests | `requests` | `POST /requests` + `POST /requests/:id/review` | insert is always `pending` with `requestedBy` = actor and `requestedAt` = now (`requests.ts:136-150`); review sets `reviewedBy` = actor and `reviewedAt` = now (`requests.ts:170+`) |
| absences | `absences` | `POST /lessons/:id/absence` (`lessons.ts:778`) | refuses future lessons, one per lesson, `reportedBy` = actor, and **refunds a credit when `refundTeacherCancellations` is on** (`lessons.ts:821-837`) - importing would fabricate ledger rows and possibly cancel a lesson |
| ratings | `ratings` | `POST /lessons/:id/ratings` (`lessons.ts:620`) | only the enrolled student may call it, only on a `completed` lesson with attendance != `no-show`, one per `from`; `authorName` comes from the session/profile, `createdAt` = now (`lessons.ts:639-679`) |
| assignments | `assignments` | `POST /assignments` + submit/review | insert always `assigned`; submit/review timestamps are now |
| credits | `credit_entries` | `POST /credits` (`credits.ts:118`) | `actorId` = session (`credits.ts:151`), `createdAt` = now, so a historical ledger row cannot be reproduced; students may only `purchase` for themselves |
| activity | `activity` | **none** | `routes/activity.ts` is GET-only (admin); every command writes a *new* event with the session actor and current time |

Additional consequences:

- `POST /bookings` is unusable for history: it charges 1 credit (`bookings.ts:208-248`) and deletes a
  slot opening (`:213-217`).
- Driving the endpoints would also emit fake activity entries ("lesson.booked", "request.created")
  for historical records, polluting the admin activity feed (`AdminSettings.tsx:121-135`).

### 7. Server-side limits that constrain an import

- Rate limit: `RATE_LIMIT_MAX` defaults to **300 requests/minute** (`config/env.ts`), applied globally
  (`app.ts:116`). A per-record loop for a full school (users + profiles + enrollments + 2 calls per
  lesson + requests + ratings + credits) exceeds that.
- JSON body limit is Fastify's default **1 MiB** (no `bodyLimit` is configured in `app.ts:35`), so a
  bulk endpoint cannot carry data URLs inline; multipart is capped at **5 MB and 1 file**
  (`app.ts:117-118`).
- `users.email` is unique (`schema.ts:92`), so a local user whose email already exists on the server
  must be mapped, never inserted.

## Library/API Findings

- `SchoolData.version` is `3` on both sides (`types.ts:8`, `routes/school.ts:24`), and the bootstrap
  guards it at runtime (`api/bootstrap.ts:75-114`). An import payload can therefore reuse the
  frontend `SchoolData` type as its wire format without a version negotiation.
- `BOOTSTRAP_COLLECTION_KEYS` (`routes/school.ts:27-44`) is asserted against `SchoolCollections` by
  `backend/tests/contract.test.ts`, so any import that adds/renames a collection breaks the build,
  not just runtime.
- The 16 collections have a strict FK order: `users` -> profiles -> `courses` -> units -> plans ->
  enrollments -> lessons -> (slot openings, requests, absences, ratings) -> credits -> activity.
  `requests.lessonId`, `absences.lessonId`, `ratings.lessonId`, `credit_entries.lessonId` and
  `attachments.id` are the cross-links an import must resolve via an id map.
- `attachments.storageKey` is unique (`schema.ts:231`), and `POST /uploads` derives it from a random
  UUID plus the client extension (`uploads.ts:40`), so path collisions are not a practical risk.

## Candidate Import Shapes (facts, not a decision)

| Shape | What it is | Preserves | Loses / costs |
|---|---|---|---|
| A. Client-driven, existing endpoints | A UI module reads the local blob, then calls `POST /users`, `POST /lessons`, `PATCH /lessons/:id`, ... in FK order | nothing new on the server; no schema change | every `createdAt`/`createdBy`/`actorId`, request review state, activity history, lesson `endTime` (forced 25 min), rating authorship; fake activity rows; must stay under 300 req/min; partial failure leaves a half-imported school |
| B. One bulk server endpoint | `POST /school/import` (admin) accepts a `SchoolData`-shaped body plus attachment metadata, runs one transaction, generates UUIDs server-side, returns an id map | all timestamps, actors, request states, activity rows, `endTime`, historical ledger dates; atomic; one rate-limit slot | new backend surface, a new zod schema mirroring `SchoolData`, and a decision about how bytes reach `UPLOAD_DIR` |
| C. Operator script (direct DB) | A `tsx` script under `backend/src/db/` reads an exported JSON file and inserts rows | everything, including activity, with no HTTP limits | not self-service, needs DB credentials and an export step, bypasses route validation, and the browser still has to hand the blob over somehow |

All three need the same supporting decisions: a pre-bootstrap capture of `lumina-school:v1`, an id
map, a seed-vs-user-data filter, and an idempotency marker (nothing today records "this store was
already imported" - a grep for an import/ledger table returns none).

Open design question with no existing precedent: attachment bytes. A bulk endpoint would need either
(a) the client to upload each file through `POST /uploads` first and pass the returned ids into the
bulk payload, or (b) a server-side writer that accepts base64 and writes into `UPLOAD_DIR` (new code,
must reuse the existing 5 MB/type rules in `uploads.ts:14-18`).

## Risks and Failure Modes

1. **Silent data loss on first API login.** Local JSON is overwritten by the offline cache before any
   UI can act (fact 2). This is the highest-severity finding: without a capture step, D2 cannot work
   at all and D3 would ship a fallback removal that destroys users' data.
2. **Orphaned IndexedDB/localStorage bytes.** Once the JSON is gone, `idb:*` and
   `lumina-school-file:*` entries have no owner and no UI path to them.
3. **Duplicate school.** Importing a pristine (untouched) local store duplicates every demo lesson,
   rating and credit entry against the backend seed (fact 5).
4. **Fabricated financial history.** `POST /bookings` (-1 credit) and `POST /lessons/:id/absence`
   (+1 refund) would create ledger rows that never happened; `POST /credits` cannot backdate.
5. **Reference integrity.** Any missed id remap fails an FK (`onDelete: cascade` on most parents), so
   a partial import can delete or reject whole subgraphs.
6. **Activity feed pollution.** Endpoint-driven import writes one new event per record with the
   admin as actor and today's date.
7. **Re-run duplicates.** No marker exists; a second import silently doubles everything unless the
   design adds a marker or content match.
8. **Local-mode-only users have no credentials.** `POST /users` needs a password; the app already
   standardises on `Password123!` (`api/school.ts:18,55`), which is acceptable for the demo posture
   but must be stated, not assumed.

## Test Gap Analysis

Blast radius: `frontend/app/lib/school/**` (local payload + file stores), `backend/src/routes/**`
(write surface), `frontend/app/components/admin/AdminSettings.tsx` (natural host surface).

1. **Files in blast radius with zero test coverage.**
   - `frontend/app/lib/school/{store,adapter,files,migrate,repositories,seed}.ts` - no unit tests;
     the B3 memory-adapter probe was never committed
     (`process/features/backend-cutover/backlog/frontend-test-runner_NOTE_18-11-26.md`).
   - `frontend/app/lib/school/api/bootstrap.ts` - only exercised indirectly through the 9 API-mode
     e2e specs.
   - `backend/src/routes/{uploads,courses}.ts` attachment paths - the plan-attachment registration
     route has no test that asserts bytes-vs-metadata behaviour.
2. **Behaviours that need an asserting test but have none.** No test asserts (a) that
   `lumina-school:v1` is overwritten on first API bootstrap, (b) that IndexedDB keys are orphaned when
   the JSON is lost, (c) that a legacy `lumina-teacher-workspace:*` blob is merged exactly once,
   (d) that `POST /lessons` forces `endTime = time + 25`, (e) that `POST /bookings` writes a -1 credit
   row, or (f) that a request insert is always `pending`.
3. **Tier classification (preliminary, `vc-test-coverage-plan` owns the final call).**
   - *Fully-automated*: the local→server mapping function (pure, in-memory, both payloads),
     seed-vs-user-data detection, id-map/remap correctness, `avatarColor` mapping.
   - *Hybrid*: a bulk import endpoint against a real Postgres (transaction + FK order + rollback),
     exercised through vitest with a DB handle; the browser capture step through one new API-mode e2e
     spec.
   - *Agent-probe*: IndexedDB/localStorage byte capture in a real browser (service-layer only today).
   - *Known-gap*: re-running the import after a partial failure, if no marker is added.

## Open Questions

1. **Where does the import run?** Before `loadSchoolFromApi` (a boot-time capture into a recovery key
   plus an admin confirmation later), or as an explicit pre-login screen? Any post-login-only UI loses
   the payload.
2. **Which records are in scope by default?** Only records the user created (seed rows skipped), or
   everything the local store holds? Skipping seed rows avoids a duplicated demo school; importing
   everything is a faithful copy but doubles fixtures.
3. **Who may import?** Admin only (matching `POST /users` and `PATCH /settings`), or also the manager
   who owns the data?
4. **How do attachment bytes travel?** Per-file `POST /uploads` then ids in the bulk payload, or
   base64 inside a bulk endpoint with a raised body limit?
5. **What is the idempotency contract?** A local marker key, a server `imports` table, or
   content-matched duplicates; and does a second run update or refuse?
6. **Are local-only users imported with `Password123!`** (matching the existing API-mode default), or
   are they skipped and re-invited?
7. **Is the local store kept as a read-only archive after import** (new key, e.g.
   `lumina-school:imported:<date>`), or deleted? D3 must not remove the fallback before this is
   answered.
8. **Does the import own settings?** The local `settings` blob can differ from the server row; a bulk
   import would overwrite school-wide rules that other users already rely on.

## Next Step

No plan, no code, no schema change was made in this phase. The next mode is INNOVATE (choose the
import shape and answer the open questions), then PLAN. Recommended execution strategy for the next
phase is sequential: one design decision (capture point + shape) gates everything else, so parallel
subagents would duplicate the same reading.
