# Lumina ESL - Cutover Progress

Live status for the frontend/backend integration. The plan is in
`CUTOVER_PLAN.md`; app-wide state stays in `PROGRESS.md`.

**Current step:** Step D closed - D3 fallback removal done and archived; the cutover plan has no
open steps.
**Last updated:** November 20, 2026.

## Board

| Slice | Status | Notes |
| --- | --- | --- |
| Step A - Align accounts and seeds | ✅ Done | Committed `c72ff04` (with the auth slice). |
| B0.1 - `GET /school/bootstrap` | ✅ Done | Role-scoped snapshot in `SchoolData` shape (`backend/src/routes/school.ts`). |
| B0.2 - Domain rule gaps | ✅ Done | All 7 gaps plus manager write scoping and course unit/publish guards. |
| B0.3 - Stable response shapes | ✅ Done | Bootstrap mappers use ISO strings/arrays; lesson reads expose plan provenance. |
| B0.4 - Contract tests | ✅ Done | `backend/tests/contract.test.ts` + live role/command smoke matrix. |
| B1 - Read path | ✅ Done | `api/bootstrap.ts`; API mode hydrates from bootstrap, demo/local unchanged. |
| B2 - Write path | ✅ Done | All current school write services use typed API/local branches with async UI call sites and post-write refresh. |
| B3 - Domain slices | ✅ Done | Course ownership, activity log, `npm run smoke` (11 domains, 306 checks), parity fixes, numeric credits, 1 credit per lesson. Independent EVL rerun green (Nov 18). Plan archived to `process/features/backend-cutover/completed/b3-domain-smoke_18-11-26/`. |
| Step C - Uploads + notifications | ✅ Done | API uploads/downloads (5 MB + MIME allowlist), activity-backed bell merged with the role derivation, `notification_state` read/mute per user. Browser + smoke evidence Nov 18. |
| Step D - Parity + removal | ✅ Done | D1 parity suite: Playwright, green twice back to back. D2 one-time import: admin-only `/school/import` + `/import/preview`, store-key split, pre-bootstrap capture, receipt; suite was 13 API + 1 demo, green twice back to back Nov 19. Plan and reports archived to `process/features/backend-cutover/completed/d2-one-time-import_19-11-26/`. D3 fallback removal done Nov 19, 2026: `upgrade()` data-source aware, `resetSchool()` inert in API mode, reset controls hidden, demo account writes demo-only; 15 API + 3 demo tests. Archived to `process/features/backend-cutover/completed/d3-fallback-removal_19-11-26/`. |

## Rule-gap checklist (B0.2)

- [x] Advance `enrollment.nextPlanIndex` when a planned lesson is completed.
- [x] One rating per lesson per source (`student` / `parent`), completed and attended only.
- [x] Refuse archiving a course with enrolled students (also blocks `DELETE /courses/:id`).
- [x] Refuse deleting a lesson plan attached to any lesson.
- [x] Record a teacher absence (cancel + refund per settings; manager team only).
- [x] Student cancellation honouring `studentLateCancellationHours`.
- [x] Scope manager reads (users, teachers, students, users by id) to their team.
- [x] Refuse publishing a course with no lesson plans.
- [x] Refuse deleting a unit while it has plans, or the last unit in a course.
- [x] New courses start with `Unit 1`, matching the browser store.
- [x] Manager writes on teachers/students/enrollments/requests/credits/bookings/homework are team-scoped.

## Read-path checklist (B1)

- [x] `app/lib/school/api/bootstrap.ts` fetches `/school/bootstrap` with the typed client and
  validates version, settings, and all 16 collections before use (`parseSchoolData`).
- [x] API mode (`NEXT_PUBLIC_DATA_SOURCE=api` + `NEXT_PUBLIC_DEMO_MODE=false`) starts from an empty
  store, never the demo seed, and hydrates only after the API session is known.
- [x] Shell shows "Loading your school" while bootstrapping and a retry/logout card on failure.
- [x] Last good payload is cached in `lumina-school:api-cache` (`API_CACHE_KEY`) with
  `lumina-school:cache-owner`; the cache is only used for the same account. API mode never
  writes `lumina-school:v1`, which stays local/demo only (D2 split; the old shared key is what
  destroyed local-only data on the first API sign-in).
- [x] Window focus / tab visibility re-reads the snapshot in API mode (15 s throttle). Cross-tab
  storage events stay local-mode only.
- [x] Refresh after every API mutation: all migrated commands refresh the role-scoped snapshot.

## Write-path checklist (B2)

- [x] Dedicated API modules provide typed commands for settings, people, curriculum,
  bookings, teaching, approvals, homework, credits, and profile writes.
- [x] API service errors are converted to `ServiceResult.error` using `ApiError.message`.
- [x] Every current write service has a local/API branch and async UI call sites.
- [x] Every successful API write refreshes the bootstrap; failed writes do not update
  the server cache.
- [x] Align the backend credit-hour contract with the UI's fractional-hour adjustments.
- [x] Added backend routes for request withdrawal, course duplication, attachments,
  and dedicated rebooking.
- [x] Add mutation-specific browser/API smoke coverage for each migrated domain (closed by `npm run smoke` in B3).

## Domain-parity checklist (B3)

- [x] Course ownership matches `canEditCourse`: managers update/delete/archive only
  their own courses; admins edit every course; nested unit, plan, and attachment
  routes resolve the owning course and apply the same rule.
- [x] Duplicating a visible course stays open to any manager; the copy is owned by
  the actor and is immediately editable only by them and admins.
- [x] 20-case live smoke matrix over POST/PATCH/DELETE on courses, units, plans,
  and duplicate for owner, other manager, and admin (including 403/404 paths).
- [x] Write activity entries for every mutating route (people, curriculum, lessons,
  settings, enrollments, homework, credits, requests) so the admin log and
  notifications stop being empty.
- [x] Add `GET /activity` (admin, paginated, filterable by action/target/actor). The
  admin log itself reads the bootstrap snapshot, which now carries the rows.
- [x] Action names follow the browser store's vocabulary (`course.*`, `user.*`,
  `teacher.*`, `student.*`, `enrollment.*`, `credits.*`, `settings.updated`,
  `homework.*`, `request.*`).
- [x] Per-domain API smoke: `npm run smoke` (root alias of `npm run smoke --workspace @lumina/backend`,
  `backend/scripts/smoke.ts`) starts a temporary backend on `127.0.0.1:4100` (`SMOKE_PORT`), creates
  per-run fixtures (`smoke-{runId}-*@smoke.lumina.test`), and checks settings, slots, booking, on-behalf,
  rebook, lessons, requests, credits, homework, quality, and profile: allowed role OK, denied roles 403,
  cross-team manager 403, exact credit deltas, exactly one activity row per mutation. Never resets,
  pushes, or truncates; refuses `NODE_ENV=production`, non-local DB hosts (unless `SMOKE_ALLOW_REMOTE=1`),
  and port 4000; restores settings in `finally`/SIGINT; archives its users. Fixture rows stay behind.
- [x] Credit `hours` are JSON numbers end to end (postgres `numeric` parser in `plugins/db.ts`); the API-mode
  shell no longer crashes on `"12.00"` strings.
- [x] One credit per lesson in demo mode (`LESSON_CREDIT_HOURS = 1`); `SCHOOL_SCHEMA_VERSION` 2 -> 3 (stale
  browser stores re-seed).
- [x] Parity fixes: booking/`POST /lessons` fill enrollment, next plan, and `ESL-####` room code; rebook,
  reschedule, slot open/close, request create/withdraw are logged; complete refuses a cancelled lesson;
  cancellation requests must target the teacher's own lesson; approve-cancel refuses a completed lesson
  and never refunds twice (API and demo); homework cannot be reviewed twice (API and demo); student rating
  and cancellation attachments go through the API in API mode.

## Step C checklist (uploads + notifications)

- [x] `requestBlob` + typed download helpers in `app/lib/api/client.ts`; new
  `api/uploads.ts` and `api/notifications.ts`; shared `school/attachment-download.ts`
  picks API bytes vs IndexedDB/localStorage bytes.
- [x] Plan-file uploads and downloads use `POST /uploads` and `GET /uploads/:id/download`
  in API mode (`services/uploads.ts`, `ManagerCurriculum.tsx`, `TeacherLessons.tsx`);
  attachment ids stay on plans and cancellation evidence. Upload size limited to 5 MB and
  the MIME allowlist (pdf, image/*, msword, docx, pptx) is enforced on the server.
- [x] Teacher cancellation evidence uploads through the API (`uploadDataUrlAttachment`)
  and renders inline in the manager review modal by id (`CancellationAttachment`,
  object URL preview, download fallback).
- [x] `useNotifications` merges `GET /notifications` with the per-role derivation
  (`activityNotification` + `mergeNotifications`, deduped by target, sorted, capped at 30).
- [x] Read/mute state is per user in the new `notification_state` table
  (`GET`/`PATCH /notifications/state`, 300 read ids, category allowlist); the bell
  writes optimistically and Settings writes mute changes through.
- [x] Demo/local mode unchanged: IndexedDB uploads/downloads and localStorage
  read/mute still work (browser-verified Nov 18).
- [x] Smoke gained `uploads` (16 checks) and `notifications` (21 checks) domains;
  contract tests cover both routes plus 401s.
- [x] Notification ids stay bounded (the "lessons without a plan" reminder no longer
  embeds every lesson id) so `PATCH /notifications/state` accepts mark-all-read.

## Step D1 checklist (parity suite)

- [x] Runner: `@playwright/test` pinned to `1.65.1` in the frontend workspace (cached
  Chromium reused, no browser download); scripts `e2e:api`, `e2e:demo`, `e2e`, plus a root
  `npm run e2e` alias.
- [x] Two configs, not two projects: `playwright.config.ts` (API mode, port 3000, backend on
  4000) and `playwright.demo.config.ts` (demo mode, port 3100, no backend). `NEXT_PUBLIC_*`
  is inlined at dev-server start, so one server per mode is the only honest split.
- [x] `e2e/serve.mjs` injects the mode env and spawns `next dev`; both runs are sequential
  (`workers: 1`), each on its own port.
- [x] API specs assert server state, not only pixels: credit deltas from
  `/credits/balance/:id`, lesson status and request status from `/school/bootstrap`, and
  notification read/mute state from `/notifications/state`.
- [x] Fixtures are self-contained: unique `runId` per test (file names, homework titles,
  cancellation comments), teacher opens a fresh future slot, manager books the refund lesson
  on behalf of the seeded student, notification state is captured and restored in `finally`.
  No pre-existing pending request is ever approved.
- [x] Preconditions (`e2e/support/preconditions.ts`) verify `/health`, the seeded admin
  login, the four seeded accounts, and a non-empty lesson collection. They fail with the
  exact command to run and never migrate, seed, or repair.
- [x] Selectors are role/label/text/class based, taken from the Step C browser evidence;
  no `data-testid` was added and no `frontend/app/**` file changed.
- [x] `.gitignore` covers `test-results/`, `playwright-report/`, `blob-report/`; frontend
  ESLint ignores those folders too (the HTML report ships a bundled trace viewer that made
  `npm run lint` fail before the ignore was added).
- [x] Backend `webServer` uses `npm run start` (no `--watch`) so a failed boot cannot leave a
  detached `tsx watch` child holding port 4000.

## Step D2 checklist (one-time import)

- [x] Store-key split: `API_CACHE_KEY = "lumina-school:api-cache"` in `store.ts`; `hydrateSchool()`
  routes API saves there and `api/bootstrap.ts` reads/writes it. `lumina-school:v1` is local/demo only,
  so an API sign-in can no longer overwrite the local school before it is imported.
- [x] Capture before the first bootstrap: `LuminaApp` calls `captureLocalSnapshot()` before
  `loadSchoolFromApi` (and `bootstrap.ts` repeats it defensively). The snapshot lands in
  `lumina-school:pending-import`; only payloads with at least one non-UUID id count as local data.
- [x] `POST /school/import` + `POST /school/import/preview` (`backend/src/routes/school-import.ts`),
  admin only via `requireRole("admin")`, route-scoped `bodyLimit` 8 MiB, zod payload pinned to
  `version: 3`.
- [x] `backend/src/lib/school-import.ts`: pure `buildImportPlan` (slug -> UUID, adopt users by email,
  seed-row exclusion, drop records with a missing required parent, null optional FKs, avatar palette to
  hex, warning list capped at 200) and `applyImportPlan` writing every collection in one
  `app.db.transaction`. Profile ids are receipted but kept out of the flat `idMap` because the browser
  store keys profiles by their user.
- [x] Attachments: bytes go through the existing `POST /uploads` between preview and import; the payload
  carries `localId -> serverId`. The planner never inserts attachment rows, drops a file with no bytes,
  and records a `missing-bytes` warning.
- [x] Idempotency: one `activity` row `school.imported` / `targetType: "school"` /
  `targetId: source.seededAt`; a repeat is 409 unless `options.force`. `school.imported` is part of the
  backend `ActivityAction` union.
- [x] Admin UI: `AdminSettings` "Import local data" tab (API mode only) with capture refresh, seed and
  settings toggles, Preview, Import, receipt download, and warning/empty/error states.
- [x] Client modules: `school/import/capture.ts`, `school/import/plan.ts` (canonical-JSON seed diff,
  data-URL -> `File`), `school/import/run.ts` (preview/import orchestration, archive + clear, receipt
  JSON), `school/api/import.ts`.
- [x] Tests: `backend/tests/school-import.test.ts` (13 planner/schema tests, including the profile/user
  id collision) and `frontend/e2e/api/{import,cache-keys}.spec.ts` (4 tests) proving no writes on preview,
  history/end time/request state/credit sign/byte parity, the marker row, 409 then forced 201,
  admin-only 403s, `v1` untouched by an API login, and UUID-only payloads not captured.
- [x] No schema change and no migration: rollback is the receipt JSON (`createdIds` per collection).

## Verification log

| Date | Slice | What was checked | Result |
| --- | --- | --- | --- |
| Nov 16, 2026 | Step A | `npm run db:reset`; API login + `/auth/me` for all five `.school` accounts; teacher/student profile links; Chromium API-mode admin shell; demo-mode login with any password; `typecheck`, `lint`, backend tests | Pass |
| Nov 17, 2026 | B0.1 | `GET /school/bootstrap` as admin, both managers, teacher, student; settings `2 h` / `23:30`; scoped counts; referenced users resolvable; manager2 sees published course only | Pass |
| Nov 17, 2026 | B0.2 | Publish no plan 400; archive enrolled 409; delete attached plan 409; delete unit with plans 409; delete last unit 409; duplicate student/parent rating 409; absence before start 400; absence after start 201 + refund; duplicate absence 409; far cancel refunded=true; near cancel refunded=false; foreign manager read/write 403 | Pass |
| Nov 17, 2026 | B0.3/B0.4 | `typecheck`, `lint`, `npm test` (11/11, including new contract suite); bootstrap key/route/auth contract; seed now has enrollment, 2 lessons, 1 rating | Pass |
| Nov 17, 2026 | B1.1 | Live bootstrap from the API parsed by the frontend `parseSchoolData` for all five accounts; settings `Lumina ESL` / `23:30`; counts match the role scopes; broken payload rejected with `SchoolBootstrapError` | Pass |
| Nov 17, 2026 | B1.2 | Browser (`DATA_SOURCE=api`, `DEMO_MODE=false`): admin and student sign-in hydrate the shell, cache owner matches the account, no demo data, no auth card, no console errors; student reload restores the session through the refresh cookie; manager2 renders an empty team without errors | Pass |
| Nov 17, 2026 | B1.3 | Focus/visibility refresh path compiled and shipped; mutation-time refresh deferred to B2.2 by design | Partial (expected) |
| Nov 17, 2026 | B1 wrap-up | Root `typecheck`, `lint`, backend `npm test`; demo-mode browser login still works after restoring `.env.local` | Pass |
| Nov 17, 2026 | B3 curriculum | Live 20-case ownership matrix: manager creates/edits own course, unit, plan; other manager gets 403 on PATCH/DELETE course, unit rename, plan add/edit/delete; other manager may duplicate and then owns the copy; admin edits any course/plan; unknown course 404; archive cleanup 200. Plus backend `typecheck`/`lint` | Pass |
| Nov 18, 2026 | B3 smoke | `npm run smoke` twice back to back: 11/11 domains, 306 checks each (runs `mwlgvlrl51c9`, `mwlgvwz0f90b`), settings restored to 24 h / refunds on. Deliberate red run (booking delta set to -2): `FAIL booking`, exit 1, reverted. Grep gate (no reset/push/truncate) empty. Root `typecheck`, `lint`, backend `npm test` (16/16, new `db-types.test.ts`), `git diff --check` | Pass |
| Nov 18, 2026 | B3 browser (demo) | Chromium, fresh context pre-seeded with a v2 store: store re-seeded to v3 at 24 credits; student UI book 24.0 -> 23.0, UI cancel 23.0 -> 24.0; no console errors. Local-branch service probe (Node, memory store): book/on-behalf/rebook -1 each, early cancel +1, absence +1, approve-cancel +1 once, approve on completed refused (request pending), homework re-review refused | Pass |
| Nov 18, 2026 | B3 browser (API) | Chromium, API mode, backend restarted after the version bump: admin, manager, teacher, student shells load without the hours crash (student chip 21.3 from numeric 21.25); student UI booking -1 with room code, UI cancel +1; teacher lesson page shows the room code and the attached plan; student UI rating stored (1 rating row, 1 `lesson.rated` row) | Pass |
| Nov 18, 2026 | B3 activity | Live 57-check matrix on port 4100: admin reads `/activity` (manager 403, anonymous 401); `course.created/updated/duplicated/archived`, `teacher.created/updated/reassigned`, `student.created/updated`, `user.renamed/paused/archived`, `enrollment.created/updated`, `settings.updated` all log with store-style summaries; homework, credits, and request approve/reject actions re-checked; admin bootstrap carries the rows while manager/student bootstraps stay empty; newest-first ordering, paging, and `targetType` filter. Plus backend `typecheck`/`lint`/`npm test` (12/12) | Pass |
| Nov 18, 2026 | B3 EVL rerun (independent vc-tester) | `typecheck`, `lint`, backend `npm test` (16/16, 4 files), `git diff --check`; `npm run smoke` run 1 and run 2 each 11/11 domains, 306 checks; grep gate empty; `backend/scripts` excluded from `npm test`; settings restored after both runs; port 4100 free afterwards. Browser gates were not re-run by the tester (rely on the execute log above). | Pass |
| Nov 18, 2026 | C backend | `notification_state` migration applied (`npm run db:migrate`); contract tests for `GET /notifications`, `GET`/`PATCH /notifications/state`, `POST /uploads`, `GET /uploads/:id/download` incl. 401s (17 tests); upload validation 5 MB + MIME allowlist; `typecheck`, `lint` | Pass |
| Nov 18, 2026 | C browser (API mode) | Chromium, `DEMO_MODE=false`, `DATA_SOURCE=api`: admin signs in through `/auth/login` + bootstrap, uploads a PDF (`201`), downloads identical bytes, bell merges the 35-row activity feed (30 shown), mark-all-read persists (32 read ids, 0 unread after reload), mute persists through reload, teacher files a cancellation with a PNG, manager review modal renders the evidence from a blob URL and downloads it; no page errors. 25/25 checks | Pass |
| Nov 18, 2026 | C browser (demo mode) | Chromium, `.env.local` defaults: IndexedDB upload + byte-identical download, localStorage bell read state survives reload, mute survives reload, teacher cancellation evidence stored as a data URL and rendered inline for the manager; no page errors. 10/10 checks | Pass |
| Nov 18, 2026 | C smoke | `npm run smoke`: 13/13 domains, 343 checks (`uploads` 16, `notifications` 21), settings restored; deliberate red run (301-item feed cap) failed `notifications` with exit 1, then reverted. Root `typecheck`, `lint`, backend `npm test` (17/17), `git diff --check`, grep gate (no reset/push/truncate) | Pass |
| Nov 18, 2026 | D1 suite | `npm run e2e` twice back to back on a seeded DB: run 1 API 9/9 (41.0 s) + demo 1/1 (10.0 s), run 2 API 9/9 (40.6 s) + demo 1/1 (10.0 s), both exit 0, no manual cleanup between runs. API specs cover auth (3), uploads byte parity, notification read/mute, student booking (-1 credit), manager book-on-behalf + teacher evidence + manager approve (+1 credit), and teacher→student→teacher homework; the demo spec proves IndexedDB upload/download, localStorage read/mute, and zero `/api/v1/` requests | Pass |
| Nov 18, 2026 | D1 safety | Deliberate red run (`POST /auth/login` expected 201): exit 1 with `test-failed-1.png`, `video.webm`, `trace.zip`, `error-context.md` under `frontend/test-results/api/`, then reverted to 200. Precondition probe with `E2E_API_URL=http://localhost:4999/api/v1`: beforeAll failed all three auth tests with "backend is not reachable … start it with `npm run dev:api`" and nothing was seeded or repaired. Grep gate over `frontend/e2e/**` clean (only in-memory `.push()` and prose). `git diff --check` exit 0; no `frontend/app/**` change. Root `typecheck`, `lint`, backend `npm test` (17/17) | Pass |
| Nov 19, 2026 | D2 backend | Planner/schema tests `backend/tests/school-import.test.ts` (13) and the full suite (30/30); `POST /school/import/preview` 200 with `pendingUploads: 1` and `totals.created: 10`; import 409 on a repeated marker; 401 anonymous / 403 for manager, teacher, student; backend `typecheck` + `lint` | Pass |
| Nov 19, 2026 | D2 defect | First real import returned 500 `enrollments_student_id_users_id_fk`: profiles are keyed by their user in the browser store, so the profile id overwrote the user id in the flat import map. Fixed with `createdProfile()` (receipts profile ids, never touches `idMap`) plus a regression test; repro re-run returned 201 | Pass (fixed) |
| Nov 19, 2026 | D2 suite | `npm run e2e` twice back to back on the final code: run 1 API 13/13 (49.2 s) + demo 1/1 (9.2 s), run 2 API 13/13 (50.3 s) + demo 1/1 (9.2 s), both exit 0, no cleanup between runs. `cache-keys` proves `v1` byte-identical after an API login and the pre-bootstrap capture; `import` proves read-only preview, faithful history (end time, actors, review state, credit sign, byte parity), marker row, receipt matching the response, 409 then forced 201, and admin-only 401/403 | Pass |
| Nov 19, 2026 | D2 gates | `npm run smoke` 13/13 domains, 343 checks, settings restored; root `typecheck` + `lint`; backend tests 30/30; `git diff --check` 0; grep gate over the changed files clean (only `warningsTruncated` matches `truncate`); no `.env*` edit. Residue counted: 6 imported schools, 7 attachments, 12 `school.imported` rows | Pass |
| Nov 19, 2026 | D3 store + UI | `store.ts` `upgrade()` is data-source aware and `resetSchool()` is inert in API mode (console warning, snapshot unchanged); the manager/student/teacher reset controls are hidden and both workspace handlers guarded; the two `lumina-account` writes are demo-only. Local mode keeps seeding, reset, and the legacy fill. Root `typecheck` + `lint` | Pass |
| Nov 20, 2026 | D3 suite | `npm run e2e` twice back to back on the final code: run 1 API 15/15 (58.0 s) + demo 3/3 (13.5 s), run 2 API 15/15 (53.9 s) + demo 3/3 (11.8 s), exit 0 both times, no cleanup between runs. `no-demo-seed` boots over a stale API cache: no demo assignment/course leaks, stale payload replaced, `v1` byte-identical, no reset control in any role, plus a Node store probe proving the inert reset. Demo regression proves the local upgrade fill and the local reset | Pass |
| Nov 20, 2026 | D3 gates | `npm run smoke` 13/13 domains, 353 checks, settings restored; root `typecheck` + `lint`; backend tests 30/30 (5 files); `git diff --check` 0; grep gate over the changed files clean (only the intentional `.for("update")`); no `.env*` edit. Residue counted: 12 imported schools, 13 attachments, 24 `school.imported` rows | Pass |

## Change log

| Date | Change | Files |
| --- | --- | --- |
| Nov 16, 2026 | Split the cutover plan and status out of `PROGRESS.md` into `CUTOVER_PLAN.md` and this file. | `PROGRESS.md`, `CUTOVER_PLAN.md`, `CUTOVER_PROGRESS.md` |
| Nov 17, 2026 | Added role-scoped bootstrap, team helpers, lesson commands (cancel/absence/rating/completion), course guards, manager scoping across people/booking/request/credit/homework, contract tests, and richer demo seed data. | `backend/src/routes/school.ts`, `backend/src/lib/scope.ts`, `backend/src/routes/*.ts`, `backend/src/db/seed.ts`, `backend/tests/contract.test.ts` |
| Nov 17, 2026 | B1 read path: API bootstrap loader + runtime guard, API-mode store hydration, shell loading/retry gate, per-account offline cache, focus refresh. | `frontend/app/lib/school/api/bootstrap.ts`, `frontend/app/lib/school/store.ts`, `frontend/app/lib/auth/mode.ts`, `frontend/app/components/LuminaApp.tsx`, `frontend/.env.example` |
| Nov 17, 2026 | B2 first slice: typed settings and self-name commands, async service error handling, and refresh after successful API writes. | `frontend/app/lib/school/api/school.ts`, `frontend/app/lib/school/services/result.ts`, `frontend/app/lib/school/services/quality.ts`, `frontend/app/lib/school/services/profile.ts` |
| Nov 17, 2026 | B2 people slice: API-backed manager/teacher/student create and update, status changes, teacher assignment, enrollment, email updates, and whole-hour credit creation; async people forms. | `frontend/app/lib/school/api/school.ts`, `frontend/app/lib/school/services/people.ts`, `frontend/app/components/manager/PeopleForms.tsx`, `backend/src/routes/users.ts` |
| Nov 17, 2026 | B2 write-path completion: migrated curriculum, bookings, teaching, approvals, homework, credits, request withdrawal, course duplication, attachments, dedicated rebooking, and fractional credits. | `frontend/app/lib/school/api/*.ts`, `frontend/app/lib/school/services/*.ts`, `backend/src/routes/*.ts`, `backend/src/db/migrations/0001_fractional_credit_hours.sql` |
| Nov 17, 2026 | B3 curriculum ownership: shared `assertCourseEditable` guard applied to course, unit, plan, and attachment writes; duplicate intentionally left open to any manager. | `backend/src/lib/scope.ts`, `backend/src/routes/courses.ts` |
| Nov 18, 2026 | B3 smoke and parity: postgres numeric parser + `getCreditBalance`; `resolveLessonDefaults` for booking and `POST /lessons`; typed `ActivityAction` union and `logActivity(db or tx)`; slot/rebook/reschedule/request logging; complete-cancelled 409; request lesson ownership; approve-cancel guards; homework re-review 400; optional `RATE_LIMIT_MAX` (default 300); frontend 1 credit per lesson, schema v3, API rating and request attachments; `npm run smoke`. | `backend/src/plugins/db.ts`, `backend/src/config/env.ts`, `backend/src/app.ts`, `backend/src/lib/{activity,credits,lesson-defaults,db-handle}.ts`, `backend/src/routes/{bookings,lessons,requests,credits,assignments,courses,school}.ts`, `backend/scripts/smoke.ts`, `backend/tests/*.ts`, `backend/{package,tsconfig}.json`, `package.json`, `frontend/app/lib/school/{services/*,api/teaching,notifications,seed,types}.ts`, `frontend/app/lib/data.ts`, `frontend/app/components/{LuminaApp,manager/PeopleForms,student/StudentBilling,student/StudentOverview}.tsx` |
| Nov 18, 2026 | B3 activity parity: activity writes on course, people, enrollment, settings, homework, credit, and request routes; new admin-only paginated `GET /activity`; action names aligned with the browser store's `recordActivity` vocabulary. | `backend/src/routes/activity.ts`, `backend/src/routes/index.ts`, `backend/src/routes/{courses,users,teachers,students,enrollments,settings,assignments,credits,requests}.ts`, `backend/tests/contract.test.ts` |
| Nov 18, 2026 | Step C: API uploads/downloads with 5 MB + MIME validation, activity-backed bell merged with the role derivation, per-user `notification_state` (read ids + muted categories), cancellation evidence by attachment id, bounded notification ids, smoke `uploads`/`notifications` domains. | `backend/src/{db/schema.ts,lib/notifications.ts,routes/notifications.ts,routes/uploads.ts,app.ts}`, `backend/src/db/migrations/0002_notification_state.sql`, `backend/scripts/smoke.ts`, `backend/tests/contract.test.ts`, `frontend/app/lib/{api/client.ts,hooks/useNotifications.ts,school/notifications.ts,school/attachment-download.ts,school/api/{uploads,notifications}.ts,school/services/{uploads,teaching,curriculum}.ts,school/views.ts,types.ts,school/index.ts}`, `frontend/app/components/{manager/ManagerApprovals.tsx,manager/ManagerCurriculum.tsx,manager/ManagerSettings.tsx,teacher/TeacherLessons.tsx}` |
| Nov 18, 2026 | Step D1: Playwright parity suite for API mode (auth, uploads, notifications, booking, cancellation/refund, homework) and a demo-mode regression, with mode-specific configs, an env-injecting dev-server launcher, API state assertions, restore-on-exit notification state, and loud preconditions. | `frontend/{playwright.config.ts,playwright.demo.config.ts,eslint.config.mjs,package.json}`, `frontend/e2e/**`, `package.json`, `.gitignore` |
| Nov 19, 2026 | Step D2: one-time import from the browser store into Postgres. API mode's offline cache moved to `lumina-school:api-cache` so `v1` is never overwritten; the local school is captured to `lumina-school:pending-import` before the first bootstrap; `POST /school/import` + `/import/preview` (admin only) map slug ids to UUIDs and write every collection in one transaction, adopting users by email, uploading attachment bytes through `POST /uploads`, and marking the run with `school.imported` (409 on repeat unless forced); admin Import tab with preview, seed/settings toggles, and a receipt download; new specs plus a profile/user id collision fix. | `backend/src/{lib/school-import.ts,routes/school-import.ts,routes/index.ts,lib/activity.ts}`, `backend/tests/school-import.test.ts`, `frontend/app/lib/school/{store.ts,index.ts,api/bootstrap.ts,api/import.ts,import/*}`, `frontend/app/components/{LuminaApp.tsx,admin/AdminSettings.tsx}`, `frontend/e2e/{api/import.spec.ts,api/cache-keys.spec.ts,support/local-school.ts}`, `frontend/{PROGRESS.md,CUTOVER_PROGRESS.md,CUTOVER_PLAN.md}`, `process/context/{all-context.md,tests/all-tests.md}` |
| Nov 19, 2026 | Step D2 closeout: plan, research, and both reports archived to `process/features/backend-cutover/completed/d2-one-time-import_19-11-26/`; board, progress summary, umbrella, context router, and test router repointed; the two cosmetic findings (bell title/nav for `school.imported`, `next/image` blob warning) backlogged. | `process/features/backend-cutover/completed/d2-one-time-import_19-11-26/*`, `process/features/backend-cutover/backlog/import-followups_NOTE_19-11-26.md`, `process/context/{all-context.md,tests/all-tests.md}`, `frontend/{PROGRESS.md,CUTOVER_PROGRESS.md,CUTOVER_PLAN.md}` |
| Nov 19-20, 2026 | Step D3: demo data fenced out of the API-mode production path. `upgrade()` fills a missing collection from the seed only in local mode; `resetSchool()` is inert in API mode; the manager/student/teacher reset controls are hidden and their handlers guarded; `lumina-account` is written only in demo mode. The D2 bell follow-up is closed too (`school.imported` title + Settings nav). The offline cache, `v1`, the import lane, and `NEXT_PUBLIC_DATA_SOURCE=local` are untouched; two new specs prove the guarantee from the browser and the store, and the demo regression keeps the local reset and legacy fill. | `frontend/app/lib/school/{store.ts,notifications.ts}`, `frontend/app/components/{LuminaApp.tsx,manager/ManagerSettings.tsx,student/StudentSettings.tsx,teacher/TeacherSettings.tsx,student/useStudentWorkspace.ts,teacher/useTeacherWorkspace.ts}`, `frontend/e2e/{api/no-demo-seed.spec.ts,demo/regression.spec.ts}`, `process/features/backend-cutover/completed/d3-fallback-removal_19-11-26/*`, `process/features/backend-cutover/backlog/import-followups_NOTE_19-11-26.md`, `process/context/{all-context.md,tests/all-tests.md,planning/all-planning.md,auth/demo-vs-api-mode.md,uxui/school-data-layer.md}`, `frontend/{PROGRESS.md,CUTOVER_PROGRESS.md,CUTOVER_PLAN.md}` |

## Open decisions / blockers

- **Course ownership.** Resolved in B3: the API matches `canEditCourse`
  (admin edits all, manager edits own), duplicate stays open to any manager, and
  the copy belongs to the duplicator.
- **`GET /activity`.** Resolved in B3: admin-only, paginated, filterable by
  `action`, `targetType`, `targetId`, and `actorId`. The admin log keeps reading the
  bootstrap snapshot (now populated); non-admins still receive an empty collection.
- **Seed parity.** The API seed now has enough to exercise every role (one
  enrollment, two lessons, one rating); the full 12-student roster and history
  remain part of item 13 / Step D.
- **`seededAt`.** Bootstrap currently reports `new Date().toISOString()`; switch to
  a stored seed timestamp when the adapter needs cache invalidation.
- **Data-source flags.** `NEXT_PUBLIC_DATA_SOURCE=api` only takes effect with API
  auth (`NEXT_PUBLIC_DEMO_MODE=false`); demo sign-in keeps the browser store so the
  offline demo stays intact. `NEXT_PUBLIC_DATA_SOURCE` defaults to `local`.
- **Offline cache.** API mode writes the last good bootstrap to
  `lumina-school:api-cache` (`API_CACHE_KEY`) and the account email to
  `lumina-school:cache-owner`. It is only read back for the same account, and only when
  bootstrap fails after a valid session. `lumina-school:v1` stays local/demo only.
- **Writes in API mode.** All current school service writes use the API and refresh
  the role-scoped snapshot. Local/demo writes remain synchronous and local.
- **B3 contract notes (Nov 18).** `GET /credits/balance/:studentId` returns `balance` as a number (was a
  string). `POST /lessons` logs `lesson.booked` (was `lesson.created`); booking, on-behalf, and rebook also
  log `lesson.booked` (no `lesson.rebooked`, matching demo). `slot.closed` and `request.withdrawn` are
  backend-only actions (demo logs neither): accepted divergence. Slot actions use `targetType: "slot"` with
  the real slot id. Backend lesson-cancellation requests do not check that the lesson is `scheduled` at
  creation (the local branch does); left as is.
- **Known parity gap (new, not fixed).** Backend `POST /lessons` does not debit a credit, while the demo
  add-lesson path does; an early student cancel of such a lesson refunds +1. Backlog note written.
- **Known gaps (accepted).** Booking/credit race (no row lock), no unique lessons constraint, unlocked plan
  selection, student self-purchase up to 100 credits without payment, smoke not in CI, leave-behind
  fixtures. Backlog notes in `process/features/backend-cutover/backlog/`.
- **Step C notifications (Nov 18).** The bell shows the activity feed merged with the role-derived items
  (deduped by target, newest first, capped at 30). Read/mute state lives per user in `notification_state`
  (`read_ids` capped at 300, `muted_categories` limited to the eight known categories); `PATCH` is partial so
  a read update cannot wipe muted categories. Notification ids must stay short because they are stored in
  `read_ids`; the "lessons without a plan" reminder now uses count + date range instead of every lesson id.
- **Step C uploads (Nov 18).** API mode stores bytes under `UPLOAD_DIR` and metadata in `attachments`;
  the 5 MB cap is enforced in the route and mirrored by the multipart limit. Demo mode keeps
  IndexedDB/localStorage, behind the same `downloadAttachmentFile` helper.
- **Demo `lumina-account` in API mode (closed in D3).** API sign-in no longer rewrites the demo
  account blob: both `localStorage.setItem("lumina-account", ...)` calls in `LuminaApp.tsx` are
  demo-only, and the API-boot cleanup (`removeItem`) stays as the migration path.

## Next action

Step D is closed: D1 (parity suite), D2 (one-time import), and D3 (demo-data removal) are done and
archived under `process/features/backend-cutover/completed/`. `NEXT_PUBLIC_DATA_SOURCE=local` stays as
the documented rollback flag for one release; deleting the two env flags is a later release, not a
cutover step. `npm run e2e` is the parity gate for both modes and leaves no processes behind.
Remaining work is backlog, not a cutover step: CI wiring for the suite
(`process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md`), the import bell/nav
cosmetics (`backlog/import-followups_NOTE_19-11-26.md`), a disposable test database, and the open
booking/credit risks in `process/context/database/booking-and-credit-integrity.md`.
