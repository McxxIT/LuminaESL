# Lumina ESL - Progress and Next Plan

Last updated: November 15, 2026
Last verified: `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Status at a glance

| Area | Status | Persistence |
| --- | --- | --- |
| App shell | Working | `lumina-account` |
| Student role | Complete | `lumina-student-workspace:<email>` |
| Teacher role | Complete | `lumina-teacher-workspace:<email>` |
| Admin role | Partial (single dashboard screen) | Local component state only |

## Quick start

```powershell
npm run dev
```

Demo accounts (any non-empty password):

| Role | Email |
| --- | --- |
| Admin | `admin@lumina.school` |
| Teacher | `teacher@lumina.school` |
| Student | `student@lumina.school` |

Verification commands:

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

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

Storage key: `lumina-student-workspace:<email>`

### Admin role

- `app/components/admin/AdminDashboard.tsx` is a single dashboard screen.
- It has local state for the schedule and a working "New lesson" modal.
- Admin uses `navItems` from `app/lib/data.ts`; teacher now uses its own `teacherNavItems`.

### Teacher role

Implemented and persisted with `localStorage`:

- Overview
- Schedule
- Students
- Curriculum
- Analytics
- Profile
- Settings

Key files:

- `app/components/teacher/TeacherDashboard.tsx` - page router
- `app/components/teacher/useTeacherWorkspace.ts` - state, persistence, actions
- `app/components/teacher/*` - teacher screens
- `app/lib/types.ts` - teacher domain types
- `app/lib/data.ts` - teacher seed data, nav, defaults, and options

Storage key: `lumina-teacher-workspace:<email>`

Teacher capabilities:

- Overview: daily schedule, active students, weekly hours, tasks, student progress, and availability snapshot.
- Schedule: add, reschedule, cancel, start, and complete lessons; filter by status/student; toggle weekly availability blocks.
- Students: search/filter roster, detail view, teacher notes, homework assignment, and homework review.
- Curriculum: create/edit units, lesson sequences, publish/unpublish, and reorder units.
- Analytics: derived hours, lesson outcomes, attendance, student progress, at-risk students, curriculum coverage, and downloadable report.
- Profile and Settings: full pages matching student-role parity, including teaching focus, availability summary, notifications, scheduling defaults, export, and reset.
- Shell: `teacherNavItems` is separate from admin `navItems`; teacher Profile/Settings render as pages, not generic modals.

Teacher data is derived where possible: student next/last lessons, teaching hours, attendance, outcome counts, and curriculum totals all come from the workspace lessons/students rather than separate hard-coded analytics objects.

Teacher file structure:

```text
app/components/teacher/
  TeacherDashboard.tsx      # switch on activeNav
  useTeacherWorkspace.ts    # state + localStorage + actions
  TeacherOverview.tsx
  TeacherSchedule.tsx
  TeacherStudents.tsx
  TeacherCurriculum.tsx
  TeacherAnalytics.tsx
  TeacherProfile.tsx
  TeacherSettings.tsx
```

## Completed milestones

- [x] Student workspace, persistence, and full page set.
- [x] Teacher domain types and seed data.
- [x] Teacher page router and workspace hook.
- [x] Teacher Overview and Schedule with persistence.
- [x] Teacher Students, notes, homework, and review flows.
- [x] Teacher Curriculum editor and Analytics.
- [x] Teacher Profile and Settings full pages.
- [x] Separate teacher/admin navigation and shell integration.
- [x] Responsive teacher CSS.
- [x] Lint, TypeScript, and production build verification.

## Next plan

1. Admin role parity: route the admin nav items (Schedule, Students, Curriculum, Analytics) to real screens and persist admin state.
2. Extract shared primitives (`StudentModal` -> shared role modal, shared summary cards, shared activity chart) now that student and teacher both use them.
3. Add cross-role demo coherence: a teacher action such as assigning homework or completing a lesson could eventually write into the corresponding student workspace.
4. Responsive and accessibility polish across teacher schedule, student cards, and curriculum editor.

## Definition of done

- Every teacher nav item renders a real screen. Met.
- Teacher state survives refresh via `localStorage`. Met.
- No action is toast-only unless it is genuinely a stub. Met.
- Empty states and responsive layouts are handled. Met.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass. Met.
