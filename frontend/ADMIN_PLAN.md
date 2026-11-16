# Lumina ESL - Admin & Manager Plan

Status: **All phases (0-7) done** (November 16, 2026; phase 2 was done before phase 1). Remaining ideas are listed under "After the plan" at the end.
Backend: the standalone API now lives in `backend/` (Fastify + PostgreSQL; see the root `README.md` and `PROGRESS.md`). This document stays the admin/manager product plan; the combined frontend + backend integration roadmap is `PROGRESS.md` -> "Next plan".
Companion to `PROGRESS.md` (current state). Update both as phases land.

## 1. Decisions

| Question | Decision |
| --- | --- |
| Admin vs manager | **Two levels.** A school **admin** creates managers and assigns teachers to them. Each **manager** sees and handles only their own teachers, students, and approvals. The admin sees everything. |
| What a "class" is | **1:1 curriculum per student.** Lessons stay 1:1 and 25 minutes. A manager enrolls a student with a teacher in a curriculum course; each booked lesson automatically gets the next lesson plan from that course. No group classes. |
| Where data lives | **API exists; the demo UI still uses browser storage.** `backend/` provides Fastify + PostgreSQL behind REST, and `localStorage` remains behind the swappable repository layer until the frontend cutover. |

## 2. Why the architecture has to change first

Today each role keeps a private copy of the data:

- **Student lessons and teacher lessons are two separate lists.** A student booking reads the teacher's open slots but never creates a lesson on the teacher's side. Completing a lesson on the teacher side never reaches the student.
- **The admin writes directly into the teacher's saved workspace** (`updateTeacherLessons`, `updateTeacherSlotClosures` in `app/lib/scheduling.ts`).
- **There is exactly one teacher** (`teacher@lumina.school`, `DEMO_TEACHER_NAME`) and one manager name (`DEMO_MANAGER_NAME`), both hard-coded.
- Manager-owned data (lesson materials, ratings, absences, curriculum) currently lives inside the teacher's workspace as seed data.

"A manager handles their teachers" and "a manager uploads a lesson plan that the teacher and student both see" both need **one shared source of truth** that all three roles read from.

## 3. Target architecture

### 3.1 Layers

```text
Screens (admin/*, manager/*, teacher/*, student/*)
   │  read via hooks, call actions; no storage access, no business rules
   ▼
Hooks        useSchool(selector)  ·  useCurrentUser()  ·  role workspace hooks
   │  subscribe to store changes (useSyncExternalStore), expose scoped data
   ▼
Services     bookings · lessons · curriculum · enrollments · approvals · people · performance
   │  business rules + permission checks; the ONLY place data is changed
   ▼
Repositories one per collection: get / list / query / upsert / remove
   │
   ▼
Storage adapter (interface)
   ├─ LocalStorageAdapter   ← now (key: lumina-school:v1, cross-tab sync via the storage event)
   └─ ApiAdapter            ← later (Next.js route handlers + database)
```

Rules that keep it clean:

1. **Screens never touch `localStorage`** and never contain rules like "cancellation within 2 hours costs 10 points". They call a service action and render what hooks return.
2. **Services are the only writers.** Every action takes the acting user, checks permissions (`permissions.ts`), validates, writes through repositories, and records an activity entry.
3. **One record per real thing.** A lesson exists once and is shown to the student, teacher, and manager with different views, not copied into three workspaces.
4. **Ids, not names.** Records reference `teacherId`, `studentId`, `managerId`, never display names like `tutor: "Alex Johnson"`.
5. **Role workspaces keep only personal data**: profile, settings, private teacher notes, tasks, practice history. Shared facts move to the school store.

### 3.2 Folder structure

```text
app/lib/school/
  types.ts            # shared domain entities (section 4)
  adapter.ts          # StorageAdapter interface + LocalStorageAdapter
  store.ts            # load/save, subscribe, schema version, cross-tab sync
  seed.ts             # demo school: admin, 2 managers, 4 teachers, 8 students, 2 courses
  migrate.ts          # one-time import of existing teacher/student workspaces
  permissions.ts      # can(user, action, target) / assertCan - the permission matrix in code
  repositories.ts     # generic typed list/get/query/upsert/patch/remove over any collection, createId, recordActivity
  services/           # (phase 1+) people, curriculum, enrollments, bookings, lessons, approvals, performance, credits
  selectors.ts        # scoped queries: teachersForUser, studentsForUser, lessonsForUser, pendingRequestsForUser, ...
  index.ts            # public API; screens import from here or from app/lib/hooks
app/lib/hooks/
  useSchool.ts        # useSyncExternalStore over store.ts
  useCurrentUser.ts   # account -> User record + role scope
app/components/admin/      # admin-only screens (Managers, School settings)
app/components/manager/    # manager screens; the admin reuses them with a wider scope
app/components/shared/     # Modal, SummaryCard, TabBar, EmptyState, StatusPill (extracted from student/teacher)
```

`app/lib/scheduling.ts` keeps the pure slot math (`buildDaySlots`, `canJoinLesson`, ...). Its functions that read or write the teacher's `localStorage` move into `services/bookings.ts` and `services/approvals.ts`.
`app/lib/teacherPerformance.ts` keeps the scoring rules; it reads lessons from the store instead of the teacher workspace.

## 4. Data model (shared school store)

| Entity | Key fields | Notes |
| --- | --- | --- |
| `User` | `id`, `role` (`admin` \| `manager` \| `teacher` \| `student`), `name`, `email`, `status` (`active` \| `paused` \| `archived`), `avatarColor` | One table for every login. The new `manager` role is added to `Role`. |
| `TeacherProfile` | `userId`, `managerId`, `specializations`, `languages`, `bio`, `hireDate` | `managerId` is how "teachers per manager" works. The admin reassigns it. |
| `StudentProfile` | `userId`, `managerId`, `level`, `targetLevel`, `goal`, `guardian?` (`name`, `email`, `phone`) | `guardian` is the parent who can leave ratings. |
| `Course` | `id`, `title`, `level`, `summary`, `objectives[]`, `status` (`draft` \| `published` \| `archived`), `ownerId`, `updatedAt` | Curriculum. Replaces `teacherCurriculumSeed`/`CurriculumUnit`. |
| `CourseUnit` | `id`, `courseId`, `order`, `title` | Ordered sections inside a course. |
| `LessonPlan` | `id`, `unitId`, `order`, `title`, `focus[]`, `summary`, `sections[]` (`heading`, `items[]`), `attachments[]` | What teachers download today as "lesson material". Always 25 minutes. |
| `Attachment` | `id`, `name`, `type`, `size`, `storageKey` | File bytes live in IndexedDB via the adapter, not in the JSON store (localStorage is ~5 MB total). |
| `Enrollment` | `id`, `studentId`, `teacherId`, `courseId`, `nextPlanIndex`, `status` (`active` \| `paused` \| `completed`), `startedAt` | **The "class":** one student + one teacher + one course. Drives which plan the next lesson gets. |
| `Lesson` | `id`, `enrollmentId?`, `teacherId`, `studentId`, `date`, `time`, `endTime`, `status` (`scheduled` \| `live` \| `completed` \| `cancelled`), `roomCode`, `lessonPlanId?`, `notes`, `attendance`, `feedback`, `homework`, `scores`, `corrections`, `cancelReason`, `createdBy` | **Single lesson record** that replaces both `StudentLesson` and `TeacherLesson`. Student and teacher screens map it to their existing view shapes. |
| `SlotOpening` | `teacherId`, `date`, `time`, `openedAt`, `openedBy` | Same rules as today, keyed by teacher. A **closed** slot is an approved `slot-closure` request (no separate closure table). |
| `Request` | `id`, `type` (`slot-closure` with `date`/`time` \| `lesson-cancellation` with `lessonId`), `teacherId`, `reason`, `comment`, `attachmentId?`, `status`, `requestedAt`, `reviewedBy?`, `reviewedAt?`, `reviewNote?` | One approvals queue for managers. Routed to the teacher's manager. |
| `TeacherAbsence` | `lessonId`, `teacherId`, `note`, `reportedBy`, `reportedAt` | Recorded by the manager; feeds performance and refunds the student. |
| `Rating` | `id`, `lessonId`, `teacherId`, `from` (`student` \| `parent`), `authorId?`, `score` 1-5, `comment?`, `createdAt` | Feeds teacher performance. |
| `CreditLedgerEntry` | `id`, `studentId`, `hours` (+/-), `reason` (`purchase` \| `booking` \| `refund` \| `adjustment`), `lessonId?`, `actorId`, `createdAt` | Replaces `creditHours` on the student workspace; balance = sum. |
| `Activity` | `id`, `actorId`, `action`, `targetType`, `targetId`, `summary`, `createdAt` | Audit trail and the source of notifications. |
| `SchoolSettings` | `onTheSpotCancellationHours`, `performanceWindowDays`, `bookingWindow`, `cancellationRefundPolicy` | Admin-editable; replaces the hard-coded constants. |

## 5. Permissions

"Own" = records belonging to the manager's teachers/students, the teacher's lessons/students, or the student's own lessons.

| Action | Admin | Manager | Teacher | Student |
| --- | --- | --- | --- | --- |
| Create/edit managers | ✅ | — | — | — |
| Assign a teacher to a manager | ✅ | — | — | — |
| Create/edit/pause teachers | ✅ | own | — | — |
| Create/edit students, set guardian | ✅ | own | — | — |
| Adjust student credits | ✅ | own | — | buy only |
| Create/edit/publish courses and lesson plans | ✅ | ✅ (published courses are school-wide) | view assigned | — |
| Upload/replace lesson attachments | ✅ | ✅ | — | — |
| Enroll student with teacher + course | ✅ | own | — | — |
| Attach or swap the plan on a specific lesson | ✅ | own | — | — |
| Book a lesson | ✅ | own (on behalf) | — | ✅ open slots |
| Open slots | — | — | ✅ | — |
| Request slot closure / lesson cancellation | — | — | ✅ | — |
| Approve/decline requests | ✅ | own | — | — |
| Record teacher absence | ✅ | own | — | — |
| Complete lesson, feedback, homework | — | — | ✅ | — |
| Rate a lesson | — | — | — | ✅ (as student or parent) |
| View performance | all | own teachers | self | — |
| Edit school settings | ✅ | — | — | — |

## 6. Features by role

### 6.1 Manager (navigation: Overview · Teachers · Students · Curriculum · Schedule · Approvals · Performance)

- **Overview:** team KPIs (lessons today/this week, attendance, average performance score, open requests), the approvals queue preview, teachers at risk, and lessons this week still missing a lesson plan.
- **Teachers:** roster of the manager's teachers with status, score, students, and open slots this week. A teacher detail page shows profile, assigned students and enrollments, schedule, performance (reuses the score ring and points history), and actions: pause/reactivate, record absence on a lesson, add a note.
- **Students:** roster with level, teacher, course progress, credits, and attendance. Create a student (with guardian), edit, pause, adjust credits with a reason, view lesson history and ratings given.
- **Curriculum:** course list (draft/published), a course builder (units -> ordered lesson plans), a lesson-plan editor (title, focus, summary, Warm-up / Main task / Wrap-up sections), and attachment upload (PDF/image/doc, size-capped). Publish/unpublish, duplicate, archive.
- **Enrollments** (inside Students and Teachers): enroll a student with a teacher in a course, see `nextPlanIndex` progress, change teacher. Changing teacher ends the old enrollment (`ended`); lessons already booked stay with the teacher they were booked with.
- **Schedule:** team calendar built from real lessons and slots (replaces the static `initialSchedule` demo). Filter by teacher, book on behalf of a student into an open slot, and swap the plan on a lesson.
- **Approvals:** one queue for slot closures and lesson cancellations from the manager's teachers, with attachment preview, approve/decline with a note, and history. Moves the two existing dashboard panels here.
- **Performance:** team leaderboard by score, rating trends, on-the-spot cancellations and absences per teacher, and drill-down to a teacher.

### 6.2 Admin (everything a manager has, school-wide, plus)

- **Managers:** create/edit/deactivate managers; assign or move teachers between managers; see each manager's team size and open approvals.
- **School settings:** on-the-spot cancellation window (decides the open "2 hours vs 24 hours" question), performance window, booking hours, cancellation refund policy.
- **Activity log:** filterable audit trail of every service action.
- **Scope switcher:** view the app "as" a specific manager's team, or the whole school.

### 6.3 Changes for teachers and students

- **Teacher:** lessons, slots, requests, ratings, and absences come from the shared store. Lesson details show the plan attached by the manager (with real uploaded attachments). Completing a lesson writes feedback/homework/scores once, and the student sees them immediately. Curriculum stays manager-only.
- **Student:** booking creates the single lesson record (teacher sees it at once) and spends credits through the ledger. Lesson details show the attached plan's summary as "Prepare before class". After a completed lesson, a rating prompt (as student or parent) feeds teacher performance. Cancellations approved by the manager refund credits.

## 7. Cross-role flows

| Flow | What happens |
| --- | --- |
| Student books | `bookings.book()` checks the slot is open, creates one `Lesson`, debits credits, attaches the next plan from the active enrollment, and logs activity. Teacher and manager see it at once. |
| Manager publishes a plan | Upcoming lessons on enrollments at that position pick it up. The teacher sees **Download**; the student sees the summary. |
| Teacher requests a cancellation | Creates a `Request` routed to the teacher's manager. On approval the lesson is cancelled, the student is refunded per policy, and the on-the-spot rule may deduct points. |
| Teacher completes a lesson | Writes attendance/feedback/homework once, advances the enrollment's `nextPlanIndex`, and the student gets the lesson report plus a rating prompt. |
| Student/parent rates | Creates a `Rating`. The teacher's score and the manager's Performance page update. |
| Manager records an absence | Creates a `TeacherAbsence` (-20 points), cancels the lesson, and refunds the student. |
| Admin moves a teacher to another manager | Updates `TeacherProfile.managerId`. The teacher's pending requests and roster move to the new manager's queues. |

## 8. Migration and seed

- **New demo school seed** (`school/seed.ts`): 1 admin (Jamie Smith), 2 managers (Priya Raman `manager@lumina.school`, Marco Bianchi `manager2@lumina.school`) each with 2 teachers (Alex Johnson stays as `teacher@lumina.school`), 13 students (Alex's 9 plus 4 for the other teachers; 3 have guardians), 2 published courses built from today's curriculum and lesson-material seeds, enrollments, and lessons/ratings matching today's demo (Alex keeps the 81 score).
- **Demo logins:** add `manager@lumina.school`; keep the existing three emails.
- **One-time migration** (`school/migrate.ts`): if the old `lumina-teacher-workspace:*` / `lumina-student-workspace:*` keys exist, import their lessons, slots, requests, and credits into the school store, mark `migratedAt`, and leave personal fields (profile, settings, notes, tasks, practice) in the role workspaces.
- **Schema version** in the store (`version: 1`) so later changes can migrate safely.

## 9. Phases

Each phase ends with lint, typecheck, and a browser check of every affected role. **Teacher and student screens should look and behave the same after phases 0-1;** only the data underneath changes.

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Foundation** ✅ | `school/types`, adapter, store, repositories, seed, selectors, permissions, `useSchool`, `useCurrentUser`. No UI changes. | Done: 41 runtime checks pass (seed integrity, scoping, permission matrix, immutable updates, persistence, cross-tab sync, re-seed on old schema). |
| **1. Move teacher + student onto the store** ✅ | Single `Lesson` record; bookings, slots, requests, and credits go through `school/services`; one-time migration from old workspaces (`school/migrate.ts`); `scheduling.ts` storage helpers removed; approvals bridge replaced; schema v2. Ratings/absences are read from the store; creating them is phase 7. | Done: 38 service checks, 12 migration checks, and a 16-step browser flow (student books -> teacher sees -> cancellation request -> only the right manager sees it -> approval -> student refunded; completion saved once). |
| **2. Roles and admin shell** ✅ | `manager` role + demo logins (`manager@`, `manager2@`); `ManagerWorkspace` router for admin and manager; separate admin/manager nav; read-only Overview, Teachers, Students, Managers (admin); Approvals; coming-soon pages for later phases; `Modal` and `ComingSoon` in `components/shared`; `views.ts` adapter. | Done: browser-checked at 1440px and 390px; end-to-end test passes (Priya approves Alex's closure, the teacher workspace records it; Marco sees nothing; teacher/student pages still load). |
| **3. People** ✅ | Create/edit/pause managers (admin), teachers, and students; teacher-to-manager moves (admin; enrolled students follow); enroll or change teacher/course; credit adjustments; teacher absences (pulled forward from phase 6); login from the shared store; clean starting data for new accounts. | Done: 42 service checks and a 21-step browser flow (create teacher and student, sign in as both, pause blocks sign-in, absence costs 20 points, moving a teacher moves their student). |
| **4. Curriculum** ✅ | Course library + editor (units, ordered plans, publish/unpublish/archive/duplicate), lesson-plan editor (focus, summary, sections), file uploads to IndexedDB (5 MB each), teacher download in lesson details, read-only view of courses you don't own. | Done: 37 service checks and a 16-step browser flow (build, upload PDF, publish, enroll, student books, teacher downloads the same PDF bytes; another manager sees it read-only and duplicates it). |
| **5. Enrollments and lesson plans** ✅ | Enroll/auto-attach/advance (phases 1-3) plus: change or remove the plan on one upcoming lesson (`assignPlanToLesson`), and course progress everywhere (manager Students table + detail, teacher lesson details "Plan X of Y", student Overview card). | Done: 14 service checks and a 10-step browser flow. |
| **6. Schedule** ✅ | Week view of the team's lessons (all teachers, or one teacher with bookable open slots), week navigation, lesson details with Change plan / Record absence, and book on behalf of a student (`bookLessonOnBehalf`). | Done: 19 service checks and a 16-step browser flow (book Ava into Alex's open slot, change its plan, Marco sees only his team). |
| **7. Quality** ✅ | Student/parent ratings on completed lessons (`rateLesson`), manager Performance page (leaderboard + points history), admin School settings (on-the-spot window, performance window, student late-cancellation window, refund switch, school name) wired into scores, teacher warnings, and refunds, and an activity log with search and filters. | Done: 25 service checks and a 15-step browser flow (a rating moves the score; changing the window changes the score on the manager and teacher pages; the log records it). |

## 10. Risks and how the plan handles them

- **Storage size:** `localStorage` is ~5 MB. Uploaded files go to IndexedDB behind the adapter, with a per-file size cap (e.g. 5 MB) and a clear error.
- **Big refactor of working screens:** phases 0-1 keep the teacher/student hook APIs and view shapes, so screens change little. Each step is verified in the browser before moving on.
- **No real authentication:** demo login stays (any password). Permission checks still run in services so the rules are ready for a real backend.
- **Two tabs open at once:** the store listens to the `storage` event so admin, teacher, and student tabs stay in sync during demos.
- **Dev server stale assets:** don't run `next build` while `next dev` is running (see `PROGRESS.md`).

## 11. Open questions (defaults used until decided)

1. **Can managers create courses, or only the admin?** Default: both; published courses are visible school-wide.
2. **How do parents rate?** Default: from the student account with a "rating as parent" option and the guardian's name. Separate parent logins are out of scope.
3. **Refund policy for cancellations:** default full refund for teacher-side cancellations and absences; student-side cancellations under 24 hours are not refunded.
4. **On-the-spot window:** 2 hours today; becomes an admin setting in phase 7.

## After the plan

Ideas not built yet, roughly in order of value:

1. **Real backend.** Swap `createLocalStorageAdapter` for an API adapter (Next.js route handlers + a database) and move file bytes from IndexedDB to object storage. Services, selectors, and screens stay the same.
2. **Real authentication.** The demo accepts any password; permission checks already run in services.
3. **Notifications** built from the activity log (new booking, request reviewed, low credits).
4. **Manager-initiated lesson cancellation** (with refund) from the schedule.
5. **Guardian logins** so parents rate from their own account instead of through the student.
6. **Booking hours** (`bookingDayStart` / `bookingDayEnd`) as an editable setting; today the 08:00-23:30 window is a constant in `scheduling.ts`.

