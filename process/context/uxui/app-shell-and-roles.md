---
name: context:uxui-app-shell-and-roles
description: "LuminaApp shell, role-prefixed component folders, hooks, and naming conventions"
keywords: LuminaApp, shell, sidebar, role, admin, manager, teacher, student, components, hooks, LoginScreen, navigation
related: [context:all-uxui, context:auth-demo-vs-api-mode]
date: 17-11-26
---

# App Shell and Roles

BLUF: `frontend/app/page.tsx` + `layout.tsx` mount `frontend/app/components/LuminaApp.tsx`, the single client shell that handles login, boot, role switching, navigation, and modals. Each role has its own component folder.

## Shell behavior (`LuminaApp.tsx`)

- Demo mode: account from local state. API mode: `useAuth` session + `loadSchoolFromApi` / `refreshSchoolFromApi` (via `/school/bootstrap`); shows a boot state until the session restores.
- `effectiveAccount` picks demo account vs `accountForUser(authUser)`. See `auth/demo-vs-api-mode.md`.
- Known wart: `studentCredits` is local state seeded at 24; real balance should come from the credits service/ledger.

## Component folders (`frontend/app/components/`)

- `admin/` (AdminManagers, AdminSettings), `manager/` (~14: Approvals, Curriculum, Schedule, Students, Teachers, Profile, forms, `useApprovals.ts`), `teacher/` (~9: Lessons, Students, BookingSlots, `useTeacherWorkspace.ts`), `student/` (~13: Lessons, Assignments, Billing, LessonRating, `useStudentWorkspace.ts`), `shared/Modal`.
- Top level: `LoginScreen.tsx`, `Icon.tsx`, `NotificationPanel.tsx`.
- Conventions: role-prefixed PascalCase components, `useX.ts` hooks, `@/*` alias -> `frontend/`.

## Hooks (`frontend/app/lib/hooks/`)

`useAuth`, `useCurrentUser`, `useNotifications`, `usePersonalValue`, `useSchool`. State is `useState` + the external store (`lib/school/store.ts`) + per-role workspace hooks; no global state library.

## Product notes

Role visibility: admin sees all, manager sees own team, teacher/student see own data; parents have no login (they rate through the student account with `ratingSource: "parent"`). Curriculum Library (Phase 04, built): one global library that admin and managers curate (`manager/ManagerLibrary.tsx` + `LibraryForms.tsx`, reached from the Library tab inside `ManagerCurriculum.tsx`) and attach to lessons through a Materials dialog (`ManagerSchedule.tsx`, `ManagerStudents.tsx`); teachers (`TeacherLessons.tsx`) and students/parents via the student account (`StudentLessons.tsx`, `useStudentWorkspace.ts`) see and download the materials on their own non-cancelled lessons. Teachers cannot attach. The sidebar Curriculum entry still opens the Courses tab first. Product plans: `frontend/ADMIN_PLAN.md`.
