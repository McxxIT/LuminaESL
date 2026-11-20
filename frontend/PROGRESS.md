# Lumina ESL - Progress and Next Plan

Last updated: November 20, 2026
Last verified: Step D closed Nov 20, 2026. `npm run e2e` runs the Playwright API-mode suite (15 tests across 10 specs) and the demo-mode regression (3 tests), green twice back to back with no leftover processes; `npm run typecheck`, `npm run lint`, backend tests (30/30), and `npm run smoke` (13/13 domains, 353 checks) pass. Steps A–C, B0–B3 and D1–D3 are closed with their evidence in `CUTOVER_PROGRESS.md`; D3 (demo-data removal) is archived in `process/features/backend-cutover/completed/d3-fallback-removal_19-11-26/`; booking debit + plan-selection lock landed Nov 20, 2026.

## Status at a glance

| Area | Status | Persistence |
| --- | --- | --- |
| App shell | Working | `lumina-account` |
| Student role | Complete | Shared store + personal `lumina-student-workspace:<email>` |
| Teacher role | Complete | Shared store + personal `lumina-teacher-workspace:<email>` |
| Admin role | Complete, including Profile and Settings pages | Shared store `lumina-school:v1` + personal staff preferences |
| Manager role | Complete, including Profile and Settings pages | Shared store `lumina-school:v1` + personal staff preferences |
| Backend API | Running locally | PostgreSQL 17 database `lumina` |
| Frontend -> API | Complete (Steps A-D) | Login/logout/refresh use the API behind `NEXT_PUBLIC_DEMO_MODE`; with `NEXT_PUBLIC_DATA_SOURCE=api` the school data reads/writes PostgreSQL through `lib/school/api/*` and boots from `/school/bootstrap` (offline cache `lumina-school:api-cache`). Demo/local mode keeps `lumina-school:v1` |

## Repository layout

The project is now an npm-workspaces monorepo:

```text
esl/
├── frontend/     # Next.js 16 app (all UI and school domain code)
├── backend/      # Fastify 5 REST API, Drizzle schema, seed, tests
├── package.json  # workspaces + root scripts
└── README.md     # setup, scripts, endpoint map
```

Frontend code paths in this document are relative to `frontend/` (for example
`app/components/...`). Root commands run either workspace.

## Quick start

Prerequisites: Node.js 22+, PostgreSQL 15+.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` starts the web app on `http://localhost:3000` and the API on
`http://127.0.0.1:4000`. Local env files are already created and git-ignored:

- `backend/.env` - `DATABASE_URL` for the local `lumina` role/database plus a generated `JWT_SECRET`.
- `frontend/.env.local` - `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`.

One account set works in both modes (`npm run db:seed` also creates these in PostgreSQL):

| Where | Role | Email | Password |
| --- | --- | --- | --- |
| UI + API | Admin (Jamie Smith) | `admin@lumina.school` | any non-empty (UI) / `Password123!` (API) |
| UI + API | Manager (Priya Raman) | `manager@lumina.school` | any non-empty (UI) / `Password123!` (API) |
| UI + API | Manager (Marco Bianchi) | `manager2@lumina.school` | any non-empty (UI) / `Password123!` (API) |
| UI + API | Teacher (Alex Johnson) | `teacher@lumina.school` | any non-empty (UI) / `Password123!` (API) |
| UI + API | Student (Mia Chen) | `student@lumina.school` | any non-empty (UI) / `Password123!` (API) |

Verification commands:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build

# Parity suite (needs local Postgres, backend/.env, a seeded DB, ports 3000/3100/4000 free)
npm run e2e              # API suite on :3000 (reuses or starts the backend on :4000), then demo on :3100
npm run e2e:api --workspace @lumina/frontend   # API suite only
npm run e2e:demo --workspace @lumina/frontend  # demo regression only
```

`npm run e2e` is the browser gate for both data modes. The API suite asserts server state
(credit deltas, lesson/request status, notification read/mute) and the demo suite fails if any
request reaches `/api/v1/`. Reports land in `frontend/playwright-report/`, traces and videos in
`frontend/test-results/` (both gitignored). Do not run `npm run build` while an e2e run is
starting its dev server.

## Monorepo and backend API (new)

- **Restructure:** `app/`, `public/`, and the Next config moved to `frontend/` with `git mv` to preserve history. Root `package.json` declares `frontend` and `backend` workspaces; `package-lock.json` lives at the root.
- **Stack:** Node 22, TypeScript, Fastify 5, PostgreSQL + Drizzle ORM, Zod validation, scrypt password hashing, JWT access token + rotating httpOnly refresh cookie, role guards, multipart uploads, Vitest.
- **Schema:** `backend/src/db/schema.ts` (18 tables) mirrors the shared school domain: users and refresh tokens, teacher/student profiles, courses/units/lesson plans, attachments, enrollments, lessons, slot openings, requests, absences, ratings, assignments, credit ledger, activity, and settings.
- **Migration and seed:** `backend/src/db/migrations/0000_material_jane_foster.sql` is applied; `npm run db:seed` creates the five `.school` demo users (admin, two managers, teacher, student) with profile links, a published course with units/plans, 12 student credits, two open slots, one assignment, and defaults. `npm run db:reset` truncates every table (local only, refuses production), then migrates and seeds.
- **API surface** under `/api/v1`: auth, users, students, teachers, courses (units + plans), enrollments, lessons (complete + ratings), bookings (slots + book), requests (review + refund), assignments (submit + review), credits (ledger + balance), notifications, uploads, settings. `GET /health` is at the root.
- **Business rules ported:** 25-minute lessons, credit debit on booking, one booking per open slot, role-scoped listings, teacher cancellation refund controlled by settings, and server-side role checks on every write.
- **Tests:** `backend/tests/app.test.ts` covers health, structured 404, protected-route rejection, and body validation without touching the database; `password.test.ts` covers hashing and slot-time math.
- **Frontend auth client (new):** `app/lib/api/client.ts` is a typed fetch client over `NEXT_PUBLIC_API_URL` with the access token in memory, `credentials: "include"` for the httpOnly refresh cookie, single-flight `/auth/refresh` + one retry on a 401, and a typed `ApiError`. `app/lib/api/auth.ts` wraps login/logout/me, `app/lib/auth/session.ts` is the external session store, and `useAuth` subscribes to it. `LoginScreen` and the shell use the API when `NEXT_PUBLIC_DEMO_MODE=false`; the browser demo login stays the default (any password) until the data adapter lands.
- **Not done yet:** no school data calls the API. The browser store (`app/lib/school`) remains the source of truth. API mode now authenticates and resolves the same `.school` identities the browser seed uses (Step A), so the shell opens without "Account not found".

## Shared school layer (admin/manager work in progress)

The plan for the admin and manager roles is in `ADMIN_PLAN.md`. **Phases 0, 1, and 2 are done:** every role reads and writes one shared store.

- **Shared store** (`app/lib/school/`): storage key `lumina-school:v1`, schema version 2. Holds users, teacher/student profiles, courses and lesson plans, enrollments, lessons (one record per lesson), slot openings, requests (slot closures + lesson cancellations), absences, ratings, a credits ledger, attachments (bytes in `lumina-school-file:<id>`), and an activity log.
- **Reads:** screens use `useSchool(selector)` with selectors (`selectors.ts`) and view adapters (`views.ts`: `toTeacherLessonView`, `toStudentLessonView`, `teacherScheduleView`, `creditTransactionsView`, `performanceForTeacher`).
- **Writes:** only through `app/lib/school/services` (bookings, teaching, approvals, credits). Each takes the actor's user id, checks `permissions.ts`, runs in one `updateSchool` transaction, and returns `ServiceResult` (`{ ok, value }` or `{ ok: false, error }`); screens show `error` as a toast. A failed service changes nothing.
- **Role workspaces keep personal data only:** teacher (profile, settings, private roster notes/homework, tasks) and student (profile, settings, assignments, tasks, practice). Hook names and returned shapes are unchanged, so screens barely changed.
- **Business rules now enforced:**
  - One 25-minute lesson costs 25/60 credit hours; booking or rebooking without enough credits is refused.
  - A slot can only be booked while it is open for that teacher; the same slot cannot be booked twice.
  - Students only see their enrolled teachers when booking (the old fictional tutor list is gone).
  - Student cancellations are refunded only 24+ hours ahead (`settings.studentLateCancellationHours`); approved teacher cancellations are refunded in full.
  - New bookings get the next lesson plan from the student's enrollment; completing a lesson advances the enrollment.
- **Migration:** on first load the store imports old `lumina-teacher-workspace:*` / `lumina-student-workspace:*` data once (completed lessons, cancellation requests with attachments, closures and reviews, opened slots merged with the seed, the student's own bookings with real teachers, purchases, and the credit balance). Demo lessons with fictional tutors are dropped.
- **Reset demo workspace** (teacher/student Settings) now re-seeds the shared school for every account plus that account's personal data.
- **Manager and admin workspace** (`app/components/manager/ManagerWorkspace.tsx`): Overview, Teachers, Students, Approvals, and (admin) Managers are working pages; Curriculum, Schedule, Performance, and School settings are coming-soon pages.
- **People management (phase 3)** via `app/lib/school/services/people.ts` and forms in `app/components/manager/PeopleForms.tsx` (errors show inside the form):
  - Admin: add/edit/pause managers; move a teacher to another manager from the teacher's detail (their actively enrolled students follow; their requests route to the new manager). A banner lists teachers without a manager.
  - Manager (own team) and admin (everyone): add/edit/pause teachers; add/edit/pause students (create enrolls with a teacher + course and gives starting credits); change a student's teacher/course; adjust credits with a reason; record a teacher absence on a lesson that has started (-20 points, lesson cancelled, student refunded).
  - Paused people cannot sign in or act; students cannot book a paused teacher.
  - **Login reads the shared store**, so anyone created can sign in (any password). The static `accounts` list was removed.
  - New teachers/students start with a clean workspace built from their school record; only `teacher@` and `student@` get demo content.
- **Curriculum (phase 4)** in `app/components/manager/ManagerCurriculum.tsx` + `CurriculumForms.tsx`, services in `app/lib/school/services/curriculum.ts`:
  - Library with All / Published / Drafts / Archived; each card shows plans, units, enrolled students, and owner. Managers see published courses plus their own drafts; the admin sees everything.
  - Editor: course details and objectives, units (add, rename, reorder, delete when empty), ordered lesson plans (add, edit, reorder, delete), Publish / Unpublish / Archive / Duplicate.
  - Rules: the admin edits every course, a manager edits courses they own (others open read-only and can be duplicated); publishing needs at least one plan; plans attached to lessons cannot be deleted; courses with enrolled students cannot be archived.
  - Lesson-plan editor: title, focus, summary, and a lesson flow of sections (Warm-up / Main task / Wrap-up by default, one step per line); files (PDF, images, Word, PowerPoint, up to 5 MB) upload once the plan is saved.
  - Files are stored in IndexedDB (`lumina-files`, keys `idb:<id>`) via `files.ts` (`saveLargeFile`, `readFileAsync`) and `services/uploads.ts`; small cancellation evidence stays in `lumina-school-file:<id>`.
  - Teachers see the plan on the lesson (credited to the course owner, with a readable `.txt` name) and download each uploaded file; students see the plan summary before class.
- **Course progress and per-lesson plans (phase 5):**
  - `enrollmentProgress` / `activeCourseProgress` selectors: plans taught so far out of the course length, plus the next plan. Completing a lesson that has a plan moves it forward.
  - Manager Students: "x/y lessons" under the course in the table; the detail shows a progress bar, the next plan, each upcoming lesson's plan, and **Change plan** (any plan from a non-archived course, the student's course listed first, or "No plan"; `assignPlanToLesson`). Swapping does not change progress.
  - Teacher lesson details show "Plan X of Y · Course" next to who attached it.
  - Student Overview "Course progress" now shows real course progress (it used to show the average skill score); the credits card counts 25-minute lessons left.
  - The seed starts each enrollment's progress at the number of completed lessons that had a plan (Mia: 3 of 7). Use **Reset demo workspace** to see this in an existing browser.
- **Team schedule (phase 6)** in `app/components/manager/ManagerSchedule.tsx` (view adapter `teamWeekView` / `openSlotsForTeacher` in `views.ts`):
  - Monday-Sunday week with previous / Today / next; today is highlighted; cards show time, title, teacher → student, and status colour (completed green, live blue, cancelled struck through).
  - "All teachers" shows every lesson plus a per-day open-slot count; picking one teacher also shows their future open slots as green cards.
  - Clicking an open slot (or **Book a lesson**) opens book-on-behalf: teacher, student (students enrolled with that teacher first, with their credit balance), date, open slot, focus. Same rules as student booking (`bookLessonOnBehalf`): open slot, active student with credits, next plan from their course.
  - Clicking a lesson shows teacher, student, status, plan, cancellation, and feedback, with **Change plan** (upcoming) and **Record absence** (started, not cancelled).
  - Managers see their own team; the admin sees every teacher.
- **Quality (phase 7):**
  - Ratings: students rate completed (attended) lessons from Lessons (a **Rate** button on unrated lessons and a panel in the lesson details), as themselves or as their parent (uses the guardian's name); one rating per source per lesson (`rateLesson` in `services/quality.ts`). Ratings move the teacher's score immediately.
  - Manager **Performance** (`ManagerPerformance.tsx`): average score, average rating, on-the-spot cancellations, absences; leaderboard (score, rating, deductions, lessons taught, manager column for the admin); click a teacher for their points history with rating comments.
  - Admin **School settings** (`app/components/admin/AdminSettings.tsx`): Rules tab (school name, on-the-spot window, performance window, student late-cancellation window, refund teacher cancellations/absences) saved via `updateSchoolSettings`; Activity log tab with search and type filter.
  - Scoring rules come from settings everywhere: `performanceRules(data)` feeds `computeTeacherPerformance(lessons, rules)` for manager pages, the teacher Analytics page, and the teacher's on-the-spot warning; refunds read the same settings.
  - Every page is now built; the temporary "coming soon" component was removed.
- **Audit fixes (profile, settings, notifications, shared homework):**
  - Admin and manager now have real **Profile** and **Settings** pages (`ManagerProfile.tsx`, `ManagerSettings.tsx`) instead of the shell modal. Profile shows role, team scope, contact details, and the personal name/job title; Settings holds notification toggles, a link to School rules, and the demo reset.
  - Anyone can rename themselves through `updateMyName` (`services/profile.ts`): the change is normalised and written to the shared store, so it shows up in the sidebar, roster and every other role immediately. Email stays admin-managed.
  - Notifications are real (`lib/school/notifications.ts` + `useNotifications`): they are derived per role from the shared store (approvals, plans, lessons, homework, ratings, credits), navigate to the related page, and can be muted per category. Read state and muted categories are shared between the bell and the Settings page through `usePersonalValue`.
  - Homework is shared end to end (`services/homework.ts`, `assignments` collection): the teacher assigns, the student sees it on Assignments and submits, the teacher reviews with feedback and an optional grade, and the student sees the result. Scope is enforced (teachers only their students, students only their own work, reviewed work cannot be resubmitted).
  - The student Profile "Your teacher" card now shows the actual enrolled teacher from the shared store instead of the fictional tutor.
- Demo logins: `admin@`, `manager@` (Priya Raman), `manager2@` (Marco Bianchi), `teacher@`, `student@` - all `@lumina.school`, any password.

> Do not run `npm run build` while `npm run dev` is running. Both write into `.next`, and the dev server can get stuck serving stale CSS (pages look unstyled). If that happens, stop the dev server, delete `.next`, and restart it.

## Current state

### App shell

- `app/components/LuminaApp.tsx` is the single-page shell. It owns login, `activeNav`, notifications, modals, and the credit chip.
- Navigation is state-based. Do not add Next.js routes unless the architecture is intentionally changed.
- Sidebar bottom contains Help center, Settings, Log out, and the user profile card.
- The topbar account dropdown was removed. Profile/settings/logout are now reached from the sidebar.
- The Next.js dev indicator is disabled in `next.config.ts` with `devIndicators: false`.
- Student credits are synced to the topbar chip through `StudentDashboard` -> `onCreditChange`.

### Student role

Implemented and persisted with `localStorage`:

- Overview
- Lessons
- Practice
- Assignments
- Progress
- Billing and credits
- Profile
- Settings

Key files:

- `app/components/student/StudentDashboard.tsx` - page router
- `app/components/student/useStudentWorkspace.ts` - state, persistence, actions
- `app/components/student/*` - student screens
- `app/lib/types.ts` - student domain types
- `app/lib/data.ts` - student seed data
- `app/lib/student.ts` - date, file, and display helpers
- `app/lib/scheduling.ts` - shared 25-minute slot generation and tutor availability

Storage key: `lumina-student-workspace:<email>`

Student capabilities worth knowing:

- Booking, reschedules, and rebooks select an open 25-minute slot from the shared scheduling rules below.
- **Join** only appears while a lesson can still be joined. Ended or completed lessons show **View** instead, and the Overview hero skips lessons that have already ended.
- Lesson details show Tutor, Date, Time, and Room as a 2x2 grid of icon cards (one column under 480px). Duration is no longer shown anywhere because every class is 25 minutes.

### Admin and manager roles

- Both roles use `app/components/manager/ManagerWorkspace.tsx` (see "Shared school layer" above). Admin-only pages: Managers, School settings.
- Sidebars: `managerNavItems` and `adminNavItems` in `app/lib/data.ts`; teacher and student keep their own.
- **Approvals** (`ManagerApprovals.tsx`): slot closures and lesson cancellations with attachment preview, Approve/Decline, and an optional note. The reviewer is recorded as the signed-in manager's name. Approval cancels the lesson or closes the slot; decline keeps it and returns the note to the teacher.
- **Profile and Settings** are full pages, not modals (`ManagerProfile.tsx`, `ManagerSettings.tsx`), with the same toggle component the teacher/student pages use. The Profile page shows the role badge, team scope (teachers, students, pending approvals), contact details, name and job title; Settings holds notification toggles, a link to School settings for the admin, and the demo reset.

### Teacher role

Implemented and persisted with `localStorage`:

- Overview
- Booking slots
- Lessons
- Students
- Analytics (teacher performance)
- Profile
- Settings

Key files:

- `app/components/teacher/TeacherDashboard.tsx` - page router
- `app/components/teacher/useTeacherWorkspace.ts` - state, persistence, actions, and seed merging for older saves
- `app/components/teacher/*` - teacher screens
- `app/lib/teacherPerformance.ts` - performance points rules and score calculation
- `app/lib/types.ts` - teacher domain types
- `app/lib/data.ts` - teacher seed data, nav, defaults, lesson materials, and ratings

Storage key: `lumina-teacher-workspace:<email>`

Teacher capabilities:

- **Overview:** daily schedule, active students, weekly hours, tasks, student progress, a 25-minute booking summary with pending closures, and a **Lesson materials** card ("X of Y ready") linking to Lessons. Its primary action, **Open slots**, links to the Booking slots page.
- **Booking slots:** browse a dated list of 25-minute slots with 5-minute breaks, open closed slots instantly, and request a slot closure with a required reason.
- **Lessons:** add, view, join in advance, complete, and request cancellation; filter by status/student; review lesson reports. Teachers cannot reschedule or start a lesson. Scheduled lessons show a single **View** action, and Join/cancellation actions live inside the lesson details modal. **Join** is hidden once a lesson is completed, cancelled, or past its end time.
- **Lesson details modal:** Student, Date, Time, and Room as a 2x2 grid of icon cards (no duration), then the lesson material card, focus, notes, feedback, homework, and cancellation status.
- **Lesson material:** the manager-assigned lesson plan (`TeacherLesson.material`) appears in the lesson details with a **Download** button. It downloads a `.txt` plan (summary plus Warm-up / Main task / Wrap-up), or the attached file if a material has one. Lessons without material show "No material assigned yet". Seed materials are keyed by lesson title; Pronunciation clinic is intentionally left unassigned.
- **Lesson cancellation:** the teacher must add a reason, a comment (10+ characters), and an image or PDF. Requests show **Cancellation pending** until the manager approves or declines; the teacher can withdraw a pending request. If the lesson starts within 2 hours, the form warns that approval counts as an on-the-spot cancellation (-10 points).
- **Students:** search/filter roster, detail view, teacher notes, homework assignment, and homework review.
- **Analytics (teacher performance):** a 0-100 score ring with tier, a breakdown (on-the-spot cancellations, absences, ratings), points history with **All / Deductions / Ratings** tabs, ratings (average, 5-to-1 star distribution, recent student/parent comments), a "How points work" panel, and a strip with hours taught, lessons completed, and student attendance for the last 30 days. **Download report** exports the score and history.
- **Profile and Settings:** full pages matching student-role parity, including teaching focus, booking rules, notifications, scheduling defaults, export, and reset. Weekly availability has been removed.
- **Shell:** `teacherNavItems` is separate from admin `navItems`; teacher Profile/Settings render as pages, not generic modals.

Removed from the teacher role:

- **Curriculum:** the manager owns curriculum now. `TeacherCurriculum.tsx`, its state, actions, and CSS were deleted. `teacherCurriculumSeed` stays in `app/lib/data.ts` for a future admin curriculum screen, and old saved `curriculum` keys are dropped on load.
- **Old Analytics panels:** weekly hours chart, lesson outcomes, student progress list, needs attention, and the old summary cards and footer. Student progress and at-risk students live on Students/Overview.

Teacher data is derived where possible: student next/last lessons, teaching hours, attendance, outcome counts, and the performance score all come from workspace lessons/students rather than hard-coded analytics objects.

## Teacher performance points

Defined in `app/lib/teacherPerformance.ts`; each rule is a constant.

| Event | Points |
| --- | --- |
| On-the-spot cancellation: an approved teacher cancellation requested less than 2 hours before the start (`ON_THE_SPOT_CANCELLATION_HOURS`) | -10 |
| Teacher absent while the student was present (`TeacherLesson.teacherAbsence`, recorded by the manager) | -20 |
| 5-star / 4-star rating from a student or parent (`TeacherLesson.ratings`) | +2 / +1 |
| 3-star rating | 0 |
| 2-star / 1-star rating | -3 / -5 |

- The score covers lessons in the last 30 days, starts at 100, and stays between 0 and 100.
- Tiers: Excellent >= 90, Good >= 75, Fair >= 60, otherwise At risk.
- Declined cancellation requests cost nothing; approval through the admin dashboard applies the deduction automatically.
- The seeded demo teacher scores **81 (Good)**: one on-the-spot cancellation, one absence, and ten ratings (+11).
- Older saved workspaces get seed materials, ratings, absences, and the two new seed lessons (`teacher-lesson-18`, `teacher-lesson-19`) merged in on load (`withSeedDetails`).
- Not built yet: a way for students/parents to rate a lesson, and an admin action to record a teacher absence. Both currently come only from seed data.

## Scheduling rules

- New bookings, lessons, reschedules, and rebooks are fixed at `25` minutes (`LESSON_SLOT_MINUTES`).
- Every 25-minute class is followed by a 5-minute break, so slot start times advance every 30 minutes (`SLOT_INTERVAL_MINUTES`). Example: `08:00–08:25`, `08:30–08:55`, `09:00–09:25`.
- The booking window runs from `08:00` to `23:30` daily. `23:30–23:55` is the final class.
- Slots are **closed by default**. Teachers open the slots they want to teach and opening is instant, with no manager approval.
- Opening a slot creates a `slotOpenings` record in the shared store and removes any closure request for that slot.
- Past slots cannot be opened: if the slot's date and start time are before now, the open action is hidden and rejected in the workspace action.
- Teachers cannot close an open slot directly. They submit a closure request with a required reason; the slot shows as **Awaiting approval**.
- The school admin reviews pending requests from the dashboard and can approve, decline, or leave a note. Approved slots become **Closed**; declined slots stay open.
- Closure requests are `slot-closure` records in the shared store's `requests`; the manager's review updates the same record.
- Booked slots show the student, lesson focus, room code, and remaining time before the session. They cannot be closed over.
- Student booking reads the chosen teacher's opened slots, closures, and every student's lessons from the shared store (`teacherScheduleView`). Pending, closed, and booked slots are hidden from students.
- Demo slot openings are aligned to the `:00`/`:30` grid and keep student booking available on the next three days. Some older seed lessons sit on partial times and simply block any overlapping slot.
- Teachers cannot reschedule or start a lesson. They can join a scheduled classroom in advance, and lessons advance/cancel through manager-managed status changes.
- Lesson cancellations require manager approval. The request is stored on the lesson as `cancellation` with `pending`, `approved`, or `rejected` status. Admin approval sets the lesson to `cancelled`.
- Completed lessons, cancelled lessons, and lessons whose end time has passed cannot be joined by teachers or students; they show **View** only (`canJoinLesson`).
- Pure slot math lives in `app/lib/scheduling.ts` (`LESSON_SLOT_MINUTES`, `SLOT_INTERVAL_MINUTES`, `buildDaySlots`, `findNextOpenSlot`, `isSlotInPast`, `canJoinLesson`, `slotStartDate`, `formatTimestamp`). Reading and changing slots, lessons, and requests happens only through `app/lib/school` (selectors, views, services).

Teacher file structure:

```text
app/components/teacher/
  TeacherDashboard.tsx      # switch on activeNav
  useTeacherWorkspace.ts    # state + localStorage + actions + seed merging
  TeacherOverview.tsx
  TeacherBookingSlots.tsx   # availability, opening, and closure requests
  TeacherLessons.tsx        # sessions, join classroom, lesson materials, reports, cancellations
  TeacherStudents.tsx
  TeacherAnalytics.tsx      # performance score, points history, ratings
  TeacherProfile.tsx
  TeacherSettings.tsx
app/lib/
  teacherPerformance.ts     # points rules and score calculation
```

## Completed milestones

- [x] Student workspace, persistence, and full page set.
- [x] Teacher domain types and seed data.
- [x] Teacher page router and workspace hook.
- [x] Teacher Overview and Schedule with persistence.
- [x] Teacher Students, notes, homework, and review flows.
- [x] Teacher Profile and Settings full pages.
- [x] Separate teacher/admin navigation and shell integration.
- [x] Teacher Schedule split into dedicated Booking slots and Lessons pages.
- [x] 25-minute booking slots shared by teacher and student flows.
- [x] Weekly availability removed in favor of dated 25-minute slots.
- [x] Teacher slot closure requests with reason and manager approval/decline.
- [x] Closed-by-default slots with instant teacher opening and approval only for closures.
- [x] Admin dashboard closure and lesson cancellation approval panels with notes to the teacher.
- [x] No joining ended/completed lessons for teachers and students (`canJoinLesson`).
- [x] Duration removed from lesson details; details redesigned as a 2x2 icon-card grid.
- [x] Manager-assigned lesson materials downloadable from the teacher lesson details.
- [x] Curriculum removed from the teacher role (manager-owned).
- [x] Teacher performance points and redesigned Analytics page.
- [x] Responsive teacher CSS.
- [x] Admin and manager Profile and Settings full pages (replacing the shell modals).
- [x] Shared name changes across every role (`updateMyName`).
- [x] Real per-role notifications with navigation and category muting.
- [x] Shared homework assign -> submit -> review -> grade cycle between teacher and student.
- [x] Student Profile shows the enrolled teacher instead of a fictional tutor.
- [x] Node service tests and Playwright end-to-end checks for the audit fixes.
- [x] Lint, TypeScript, and production build verification.
- [x] Monorepo restructure into `frontend/` and `backend/` npm workspaces.
- [x] Fastify 5 API with auth, role guards, and all school-domain route modules.
- [x] PostgreSQL schema (18 tables), Drizzle migration, and reproducible seed.
- [x] JWT access tokens, rotating httpOnly refresh cookies, and scrypt hashing.
- [x] Backend unit tests plus a live HTTP smoke test against PostgreSQL.
- [x] Typed frontend API client with API-backed login, logout, refresh, and session restore behind `NEXT_PUBLIC_DEMO_MODE`.

## Next plan

The next milestone is frontend **and** backend work at the same time. Each item
is a shippable slice; the joint items are the cutover gates.

**Execution order (decided November 16, 2026):** Step A = item 11 (align accounts
and seeds) runs **before** Step B = item 2 (data adapter). Step A is done; the
detailed, file-level plan for Step B is in `CUTOVER_PLAN.md`, with live status in
`CUTOVER_PROGRESS.md`. Reason for the order: API-mode login used to land on
"Account not found in the school" because the browser seed used `.school` and the
API seed used `.test`; aligning identities first gives every later slice one login
and one dataset to test.

### Frontend track

1. **API client and auth UI.** ✅ (auth slice) Add a typed fetch client (`app/lib/api/`), wire login/logout/refresh to `/auth/*`, keep the access token in memory, and rely on the httpOnly refresh cookie. Replace the browser account switcher; keep the local demo login behind `NEXT_PUBLIC_DEMO_MODE` until parity is proven. **Landed:** `client.ts` (single-flight refresh + 401 retry, typed `ApiError`), `auth.ts`, `auth/session.ts`, `useAuth`, API/demo branching in `LoginScreen`, session restore and API logout in `LuminaApp`. Demo stays the default; accounts and seeds are now aligned (item 11), so API mode finds the user record.
2. **School adapter cutover.** (**Step B** - see `CUTOVER_PLAN.md` and `CUTOVER_PROGRESS.md`.) Implement `app/lib/school/adapter.ts` against the REST endpoints (users, students, teachers, courses, enrollments, lessons, bookings, requests, assignments, credits, settings) and route the existing services through it. Keep `localStorage` only as a demo/offline fallback, then remove it from the production path.
3. **Uploads UI.** Replace IndexedDB/localStorage file storage (`files.ts`, `services/uploads.ts`) with `POST /uploads` plus the download endpoint; keep attachment IDs in lesson plans and cancellation evidence.
4. **Notifications UI.** Feed `useNotifications` from `GET /notifications`, consume server-side read/mute state once it exists, and keep the per-role derivation until the activity log covers every event.
5. **Carried-over UI work.** Extract the role modal, shared summary cards, and a shared tab bar (the 390px sweep still shows tab rows overflowing on Curriculum, Lessons, and teacher Lessons); decide whether ended "upcoming" lessons still show Reschedule/Cancel; decide whether email/password self-service becomes a real flow.

### Backend track

6. **Auth and account lifecycle.** Password reset and email verification, per-route rate limits on login/refresh, expired-refresh-token cleanup, stricter production cookie settings, and a per-environment CORS allow-list.
7. **Domain rule parity with the store.** Close the gaps between `app/lib/school/services` and the API: advance enrollment progress when a lesson with a plan completes, enforce one rating per source per lesson, block archiving a course with enrolled students and deleting a plan attached to a lesson, record teacher absences, apply student late-cancellation refund windows from settings, and scope manager reads to their own team.
8. **Read models and performance.** Add the joined/aggregate views the UI already computes client-side (dashboards, teacher performance, credit views), enforce pagination everywhere, and add indexes for the filters actually used.
9. **Uploads and storage.** Put storage behind an adapter instead of local disk; add signed download URLs, type/size allow-lists, and cleanup for orphaned files.
10. **Contract, observability, and deployment.** Generate OpenAPI from the route schemas, add contract tests against the adapter, add request IDs/structured logs/readiness probes, then ship Docker Compose for PostgreSQL + API, migrations on deploy, backups, and CI.

### Joint integration and cutover

11. **Align accounts and seeds.** ✅ (**Step A**, done November 16, 2026.) One demo account set (`.school`) now exists in both the API seed and the browser seed, with matching names, profile links, and documented logins.
12. **End-to-end parity suite.** ✅ (**Step D1**, done November 18, 2026.) `npm run e2e` runs login, booking, cancellation/refund, homework, upload, and notification in API mode plus a demo-mode regression. CI wiring is deferred because the repo has no pipeline: `process/features/backend-cutover/backlog/e2e-ci-wiring_NOTE_18-11-26.md`.
13. **Migrate and remove duplicates.** Provide a one-time import from `lumina-school:v1`/IndexedDB, then delete duplicated seed data and the browser-store fallback once the API path is the default. Keep a documented rollback flag for one release.

### Product decisions carried over

14. **On-the-spot window.** Still 2 hours (`ON_THE_SPOT_CANCELLATION_HOURS`); confirm whether it should be 24.
15. **Notification multi-device state.** Decide how read/mute state is stored per user, then implement it on the backend.

## Cutover plan and progress (moved)

The detailed, file-level frontend/backend cutover plan now lives in
`CUTOVER_PLAN.md`; its live status board, rule-gap checklist, verification log,
and open decisions live in `CUTOVER_PROGRESS.md`.

- **Step A - Align accounts and seeds:** done November 16, 2026. One `.school`
  account set exists in the API seed and the browser seed; `npm run db:reset` is
  the guarded local reset.
- **Step B - Data adapter cutover:** done, and Step C - uploads and
  notifications - is done too. See `CUTOVER_PROGRESS.md`.
- **Step D1 - Parity suite:** done November 18, 2026. `npm run e2e` runs the API-mode suite plus the
  demo-mode regression.
- **Step D2 - One-time import:** done November 19, 2026, archived to
  `process/features/backend-cutover/completed/d2-one-time-import_19-11-26/`.
  Admin-only `/school/import` plus preview, store-key split, pre-bootstrap
  capture, receipt.
- **Step D3 - Demo-data removal:** done November 19-20, 2026, archived to
  `process/features/backend-cutover/completed/d3-fallback-removal_19-11-26/`.
  `upgrade()` is data-source aware, `resetSchool()` is inert in API mode, the reset controls are
  hidden, and `lumina-account` is demo-only. The suite is now 15 API-mode tests plus 3 demo tests.
  `NEXT_PUBLIC_DATA_SOURCE=local` stays as the rollback flag for one release.

Keep this summary and the two files in sync when a step lands; do not re-grow the
detail here.

## Definition of done

Frontend (met):

- Every teacher nav item renders a real screen.
- Teacher state survives refresh via `localStorage`.
- No action is toast-only unless it is genuinely a stub.
- Empty states and responsive layouts are handled.
- Root `npm run typecheck`, `npm run lint`, and `npm run build` pass.

Backend (met for the current scope):

- Every write route validates input, and every API route enforces authentication or role guards.
- Backend tests pass and the live smoke flow works against PostgreSQL.
- The schema migration and seed are reproducible from a fresh database.
- Secrets live only in git-ignored `.env` files.

Next milestone (not met):

- The UI authenticates through the API and reads/writes school data through it.
- No production path depends on `lumina-school:v1` or IndexedDB attachments.
- Uploads and notifications round-trip through the API.
- A clean checkout can be set up from the README alone.
