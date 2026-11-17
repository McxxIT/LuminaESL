# Lumina ESL - Cutover Progress

Live status for the frontend/backend integration. The plan is in
`CUTOVER_PLAN.md`; app-wide state stays in `PROGRESS.md`.

**Current step:** Step B - B3 domain slices in progress (curriculum ownership done).
**Last updated:** November 17, 2026.

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
| B3 - Domain slices | 🟡 In progress | Course ownership parity landed; activity logging + `GET /activity`, then per-domain smoke coverage. |
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
- [ ] Add mutation-specific browser/API smoke coverage for each migrated domain.

## Domain-parity checklist (B3)

- [x] Course ownership matches `canEditCourse`: managers update/delete/archive only
  their own courses; admins edit every course; nested unit, plan, and attachment
  routes resolve the owning course and apply the same rule.
- [x] Duplicating a visible course stays open to any manager; the copy is owned by
  the actor and is immediately editable only by them and admins.
- [x] 20-case live smoke matrix over POST/PATCH/DELETE on courses, units, plans,
  and duplicate for owner, other manager, and admin (including 403/404 paths).
- [ ] Write activity entries for every mutating route (people, curriculum, lessons,
  settings, enrollments) so the admin log and notifications stop being empty.
- [ ] Add `GET /activity` (admin, paginated) and wire the admin log to it.
- [ ] Per-domain browser/API smoke coverage for the remaining slices.

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

## Open decisions / blockers

- **Course ownership.** Resolved in B3: the API matches `canEditCourse`
  (admin edits all, manager edits own), duplicate stays open to any manager, and
  the copy belongs to the duplicator.
- **`GET /activity`.** Needed for admin log/notification parity, not scheduled in
  B0; planned for B3. Bootstrap returns an empty activity collection for non-admins.
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

## Next action

Continue B3 with activity/notification parity. Only `assignments`, `bookings`,
`credits`, and `requests` write `activity` rows today, and there is no `GET
/activity` route, so the admin log is empty in API mode. After that: the remaining
ownership/read-model gaps, per-domain smoke coverage, then Step C (uploads and
notifications).
