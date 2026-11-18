# Lumina ESL - Cutover Progress

Live status for the frontend/backend integration. The plan is in
`CUTOVER_PLAN.md`; app-wide state stays in `PROGRESS.md`.

**Current step:** Step B - B3 domain slices complete and independently re-verified (per-domain API smoke, parity fixes, 1 credit per lesson); Step C next.
**Last updated:** November 18, 2026.

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
| Step C - Uploads + notifications | ⬜ Not started | Depends on B. |
| Step D - Parity + removal | ⬜ Not started | Depends on C. |

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
- [x] Last good payload is cached in `lumina-school:v1` with `lumina-school:cache-owner`; the cache
  is only used for the same account. Local/demo mode keeps the old seed path.
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
- **Offline cache.** API mode writes the last good bootstrap to `lumina-school:v1`
  and the account email to `lumina-school:cache-owner`. It is only read back for the
  same account, and only when bootstrap fails after a valid session.
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

## Next action

Commit B3, then start Step C (uploads and notifications). B3 is closed. The earlier small gaps
are closed: `PATCH /lessons/:id` logs `lesson.planChanged` and booking logs `lesson.booked`.
