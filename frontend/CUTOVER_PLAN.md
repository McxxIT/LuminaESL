# Lumina ESL - Frontend/Backend Cutover Plan

Status: **Step A done. Step B (data adapter cutover) complete; B3 domain slices in progress.**

Companion to `PROGRESS.md` (current app state) and `ADMIN_PLAN.md` (admin/manager
product plan). This file is the file-level execution plan for connecting the
Next.js frontend to the Fastify/PostgreSQL API. Day-to-day status lives in
`CUTOVER_PROGRESS.md`.

Written November 16, 2026.

```text
Step A  Align accounts and seeds        (item 11)  DONE
Step B  Data adapter cutover            (item 2)   DONE
Step C  Uploads + notifications         (items 3, 4)
Step D  Parity suite + remove fallback  (items 12, 13)
```

Why this order: the workspace looks the account up by email in the browser seed.
The legacy `.test` API accounts were not there, so API mode showed "Account not
found in the school". Step A aligned identities first so every later slice has
one login and one dataset to test against.

## Goals and exit criteria

- `NEXT_PUBLIC_DATA_SOURCE=api` and `NEXT_PUBLIC_DEMO_MODE=false` runs every role
  from PostgreSQL only.
- Writes round-trip: settings, people, curriculum, booking, cancellation/refund,
  homework, rating.
- No screen reads or writes `lumina-school:v1` in API mode.
- Bootstrap and the domain slices pass contract tests and the parity suite.
- The browser store and IndexedDB remain only as a documented demo/offline
  fallback, then are removed from the production path.

## Decisions

| Topic | Decision |
| --- | --- |
| **Canonical demo identities** | Keep the browser seed (`.school`) and make the API seed match. Confirmed and implemented in Step A. |
| Password | API seeded accounts use `Password123!`. Demo browser sign-in keeps "any non-empty password". |
| API seed scope | Identities and profile links only: admin, 2 managers, 1 teacher, 1 student. The full roster, courses, lessons, and history arrive with Step B / item 13. |
| Data source flag | `NEXT_PUBLIC_DATA_SOURCE=local` (default) or `api`, separate from `NEXT_PUBLIC_DEMO_MODE`, so auth and data can be verified independently. |
| Local database reset | Guarded `npm run db:reset` (refuses `NODE_ENV=production`) truncates, migrates, and seeds. Never run it automatically. Added in Step A. |
| Read path | One role-scoped `GET /api/v1/school/bootstrap` returning the existing `SchoolData` shape (settings + collections), so selectors and screens stay unchanged. Per-screen fetching would rewrite the whole UI for no benefit. |
| Write path | Services call REST commands, then refresh the cache. Start with a bootstrap after each successful write (correct, slower); optimise to patch the cache from the response later. |
| Sync to async | Services become `Promise<ServiceResult>` because REST is async. Call sites add `await`; screens keep the same toast/error handling. Do this per domain slice, not as one big-bang. |
| Authoritative write | The API response wins. A failed call changes nothing; the cache is never the only copy of a write. |
| Course writes | Mirrors `canEditCourse`: admins edit every course, managers only the courses they own, and any manager may duplicate a visible course into their own draft. |

## Step B - Data adapter cutover

**Gate:** B2 is complete. All current school write services have typed API/local
branches, async UI call sites, post-write bootstrap refresh, and backend routes
for their required commands.

### B0. Backend prerequisites

- [x] **B0.1 Bootstrap endpoint.** Add `GET /school/bootstrap` (authenticated,
  role-scoped) returning `{ settings, collections }` in
  `frontend/app/lib/school/types.ts` shapes. Scope: admin everything; manager own
  team + school-wide published courses; teacher own lessons/slots/roster;
  student own lessons/enrollments/assignments/credits. **Landed:**
  `backend/src/routes/school.ts`; users referenced by a visible record are
  included so names resolve on screen; lessons can pull in the course that owns
  their attached plan.
- [x] **B0.2 Close the rule gaps before switching writes:**
  - advance `nextPlanIndex` when a lesson with a plan completes
  - one rating per source per lesson
  - block archiving a course that has enrolled students
  - block deleting a lesson plan attached to a lesson
  - record teacher absences (lesson cancelled, student refunded per settings)
  - student cancellation with the late-cancellation refund window from settings
  - manager reads scoped to their own team

  **Landed:** all seven gaps are enforced in `lessons.ts`, `courses.ts`, and the
  people/booking/request/credit/homework routes via `backend/src/lib/scope.ts`.
  Also added: publish requires a plan, unit delete requires another unit, a new
  course starts with `Unit 1`, and manager writes are scoped to their team.
- [x] **B0.3 Stabilise response shapes:** ISO `YYYY-MM-DD` / `HH:MM` for dates and
  slots, string ids, arrays for focus/objectives/languages, `attachmentIds` on
  plans, no Drizzle-only field names in the UI payload. **Landed:** bootstrap uses
  explicit mappers; lesson reads now include `planAttachedBy` / `planAttachedAt`.
- [x] **B0.4 Add contract tests** for the bootstrap shape and each command the
  adapter uses. **Landed:** `backend/tests/contract.test.ts` checks the schema
  version, collection/settings keys, route registration, and auth on bootstrap;
  the live smoke matrix covered role scoping, refunds, absences, and the course
  guards. The API seed now includes one enrollment, two lessons, and a rating so
  teacher/student bootstrap has real data.

### B1. Read path

- [x] **B1.1** Add `app/lib/school/api/bootstrap.ts` that fetches and validates
  `/school/bootstrap` as `SchoolData`.
- [x] **B1.2** Hydrate the existing store from it on load when
  `NEXT_PUBLIC_DATA_SOURCE=api`; the offline cache moved to `lumina-school:api-cache`
  in D2, so `lumina-school:v1` stays local/demo only and an API sign-in can no
  longer overwrite it.
- [x] **B1.3** Refresh on window focus and keep cross-tab sync for local mode only.
  Mutation refresh is implemented for the migrated B2 settings and self-name
  commands.

### B2. Write path and async services

- [x] **B2.1** Add typed API modules for all current school write commands,
  named after their service actions.
- [x] **B2.2** Switch every current service inside its local/API branch.
- [x] **B2.3** Convert every current service return type and UI call site to
  async API-compatible results while keeping the local branch synchronous.
- [x] **B2.4** Surface `ApiError.message` through `ServiceResult.error` for the
  migrated commands and keep failed API writes from updating the server cache.

### B3. Domain slices (next)

Do reads first, then writes in this order: settings/users, curriculum,
enrollments/progress, bookings/slots, lessons/teaching, requests/approvals,
credits, homework, quality/absence, profile/notifications.

| Domain | Local code | API (prefix `/api/v1`) | Notes / gaps |
| --- | --- | --- | --- |
| School snapshot | `store.ts`, `selectors.ts` | `GET /school/bootstrap` (new) | Role-scoped; no whole-store PUT. |
| Settings | `quality.updateSchoolSettings` | `GET/PATCH /settings` | Admin-only write; already guarded. |
| People | `people.ts` | `GET/POST /users`, `PATCH /users/:id`, `GET/PATCH /teachers/:id`, `GET/PATCH /students/:id` | Manager team scoping on reads (B0.2). |
| Profile name | `profile.updateMyName` | `PATCH /users/:id` | Self-only; already guarded. |
| Curriculum | `curriculum.ts` | `/courses` CRUD, `/courses/:id/units`, `/courses/:id/units/:unitId/plans` | Archive/delete rules (B0.2) and owner-only edits landed in B3; duplicate stays open to any manager. |
| Enrollments | `people.enrollStudent` | `GET/POST /enrollments`, `PATCH /enrollments/:id` | Progress advance on completion (B0.2). |
| Bookings / slots | `bookings.ts`, `teaching.openSlot` | `GET/POST/DELETE /bookings/slots`, `POST /bookings` | Student cancellation route missing (B0.2); rebook/reschedule mapping still open. |
| Lessons / teaching | `teaching.ts` | `GET/PATCH /lessons/:id`, `POST /lessons/:id/complete` | Absence route missing (B0.2). |
| Requests / approvals | `approvals.ts` | `GET/POST /requests`, `POST /requests/:id/review` | Approved and rejected decisions both log activity (B3). |
| Credits | `credits.ts`, `common.changeCredits` | `GET /credits`, `GET /credits/balance/:studentId`, `POST /credits` | Balance/ledger shape must match selectors. |
| Homework | `homework.ts` | `GET/POST /assignments`, `POST /assignments/:id/submit`, `POST /assignments/:id/review` | Scope checks already server-side. |
| Quality | `quality.rateLesson` | `POST /lessons/:id/ratings` | One per source per lesson (B0.2). |
| Uploads | `files.ts`, `uploads.ts` | `POST /uploads`, `GET /uploads/:id/download` | Step C; keep attachment ids, not bytes, in the store. |
| Notifications | `notifications.ts` | `GET /notifications` | Step C; read/mute state still client-side. |
| Activity | `repositories.recordActivity` | `GET /activity` (admin, paginated) | Landed in B3: every mutating route writes an activity row and the admin log reads it through the bootstrap snapshot. |

### B4. Verification per slice

For every slice: `npm run typecheck`, `npm run lint`, backend `npm test`, the live
smoke flow, and a browser pass at 1440px and 390px as admin, manager, teacher,
and student. Add a Playwright case for the user-visible flow before moving on.

### B5. Exit criteria

- `NEXT_PUBLIC_DATA_SOURCE=api` and `NEXT_PUBLIC_DEMO_MODE=false` runs every role
  from PostgreSQL only.
- Writes round-trip: booking, cancellation/refund, homework, rating, settings,
  people.
- No screen reads or writes `lumina-school:v1` in API mode.
- Bootstrap + the domain slices pass contract tests and the parity suite.

## Step C - Uploads and notifications

- [x] Replace IndexedDB/localStorage bytes with `POST /uploads` and
  `GET /uploads/:id/download`; keep attachment ids on plans and cancellation
  evidence. (Demo mode keeps IndexedDB/localStorage behind the same helpers.)
- [x] Feed `useNotifications` from `GET /notifications`; keep the per-role
  derivation until the activity log covers every event. (Merged and deduped by
  target, capped at 30 items.)
- [x] Decide notification read/mute storage per user and implement it on the
  backend. (`notification_state` table + `GET`/`PATCH /notifications/state`.)

## Step D - Parity suite, migration, removal

- [x] Run the existing Playwright audit flow against the API-backed build; add
  login, booking, cancellation/refund, homework, upload, and notification cases
  to CI. **D1 done November 18, 2026:** `npm run e2e` runs all six flows in API
  mode plus a demo regression. CI wiring is deferred because the repo has no
  pipeline: `process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md`.
- [x] D2 - Provide a one-time import from `lumina-school:v1` and IndexedDB into
  PostgreSQL. **D2 done November 19, 2026:** admin-only `POST /school/import` +
  `POST /school/import/preview` (`backend/src/{lib,routes}/school-import.ts`) map local
  slug ids to UUIDs and write every collection in one transaction; the browser captures
  `lumina-school:v1` into `lumina-school:pending-import` before the first bootstrap, and
  API mode caches to `lumina-school:api-cache` so the local key is never overwritten.
  Attachment bytes are uploaded through `POST /uploads` between preview and import;
  idempotency is a `school.imported` activity marker (409 on repeat unless forced);
  rollback is the receipt JSON, with no schema change.
- [ ] D3 - Delete duplicated seed data and the browser-store fallback from the
  production path; keep a documented rollback flag
  (`NEXT_PUBLIC_DATA_SOURCE=local`) for one release.

## Risks and mitigations

- **Rules drift between store and API.** Port the rules first (B0.2) and cover
  each with a contract test; do not cut over a domain whose rules differ.
- **Async conversion churn.** Do it per domain slice; keep the local branch
  synchronous and the UI toast contract unchanged.
- **Read-model gaps.** Bootstrap solves selectors first; dashboards that need
  aggregates get dedicated endpoints later.
- **Data volume.** Bootstrap is acceptable for the demo; before production, add
  pagination/read models and stop shipping the whole school to every role.
- **ID and timestamp mismatch.** Normalise ids to strings and dates to
  `YYYY-MM-DD` / `HH:MM` in the response mappers; test with real seeded rows.
- **Destructive reset.** `db:reset` is manual, prints what it will truncate, and
  refuses in production.
- **Lost writes.** API is authoritative; cache is a view. Never queue writes
  silently.
