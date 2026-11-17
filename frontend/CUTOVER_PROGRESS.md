# Lumina ESL - Cutover Progress

Live status for the frontend/backend integration. The plan is in
`CUTOVER_PLAN.md`; app-wide state stays in `PROGRESS.md`.

**Current step:** Step B - B0 backend prerequisites done; B1 read path next.
**Last updated:** November 17, 2026.

## Board

| Slice | Status | Notes |
| --- | --- | --- |
| Step A - Align accounts and seeds | ✅ Done | Committed `c72ff04` (with the auth slice). |
| B0.1 - `GET /school/bootstrap` | ✅ Done | Role-scoped snapshot in `SchoolData` shape (`backend/src/routes/school.ts`). |
| B0.2 - Domain rule gaps | ✅ Done | All 7 gaps plus manager write scoping and course unit/publish guards. |
| B0.3 - Stable response shapes | ✅ Done | Bootstrap mappers use ISO strings/arrays; lesson reads expose plan provenance. |
| B0.4 - Contract tests | ✅ Done | `backend/tests/contract.test.ts` + live role/command smoke matrix. |
| B1 - Read path | ⬜ Next | `api/bootstrap.ts`, hydrate in API mode. |
| B2 - Write path | ⬜ Not started | Typed commands, async services. |
| B3 - Domain slices | ⬜ Not started | Settings -> ... -> notifications. |
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

## Verification log

| Date | Slice | What was checked | Result |
| --- | --- | --- | --- |
| Nov 16, 2026 | Step A | `npm run db:reset`; API login + `/auth/me` for all five `.school` accounts; teacher/student profile links; Chromium API-mode admin shell; demo-mode login with any password; `typecheck`, `lint`, backend tests | Pass |
| Nov 17, 2026 | B0.1 | `GET /school/bootstrap` as admin, both managers, teacher, student; settings `2 h` / `23:30`; scoped counts; referenced users resolvable; manager2 sees published course only | Pass |
| Nov 17, 2026 | B0.2 | Publish no plan 400; archive enrolled 409; delete attached plan 409; delete unit with plans 409; delete last unit 409; duplicate student/parent rating 409; absence before start 400; absence after start 201 + refund; duplicate absence 409; far cancel refunded=true; near cancel refunded=false; foreign manager read/write 403 | Pass |
| Nov 17, 2026 | B0.3/B0.4 | `typecheck`, `lint`, `npm test` (11/11, including new contract suite); bootstrap key/route/auth contract; seed now has enrollment, 2 lessons, 1 rating | Pass |

## Change log

| Date | Change | Files |
| --- | --- | --- |
| Nov 16, 2026 | Split the cutover plan and status out of `PROGRESS.md` into `CUTOVER_PLAN.md` and this file. | `PROGRESS.md`, `CUTOVER_PLAN.md`, `CUTOVER_PROGRESS.md` |
| Nov 17, 2026 | Added role-scoped bootstrap, team helpers, lesson commands (cancel/absence/rating/completion), course guards, manager scoping across people/booking/request/credit/homework, contract tests, and richer demo seed data. | `backend/src/routes/school.ts`, `backend/src/lib/scope.ts`, `backend/src/routes/*.ts`, `backend/src/db/seed.ts`, `backend/tests/contract.test.ts` |

## Open decisions / blockers

- **Course ownership.** The store lets the admin edit every course and a manager
  edit only their own; the API still lets any manager edit any course. Deferred to
  the B3 curriculum slice.
- **`GET /activity`.** Needed for admin log/notification parity, not scheduled in
  B0; planned for B3. Bootstrap returns an empty activity collection for non-admins.
- **Seed parity.** The API seed now has enough to exercise every role (one
  enrollment, two lessons, one rating); the full 12-student roster and history
  remain part of item 13 / Step D.
- **`seededAt`.** Bootstrap currently reports `new Date().toISOString()`; switch to
  a stored seed timestamp when the adapter needs cache invalidation.

## Next action

Start B1: add `app/lib/school/api/bootstrap.ts`, hydrate the existing store from
`GET /api/v1/school/bootstrap` when `NEXT_PUBLIC_DATA_SOURCE=api`, and keep
`lumina-school:v1` only as the demo/offline fallback.
