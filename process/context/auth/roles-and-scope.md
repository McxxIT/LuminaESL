---
name: context:auth-roles-and-scope
description: "Roles, requireRole guards, and manager/teacher/student data scoping on backend and frontend"
keywords: roles, admin, manager, teacher, student, requireRole, scope, managerTeam, permissions, assertCan, authorization
related: [context:all-auth, context:all-database]
date: 17-11-26
---

# Roles and Scope

BLUF: Four roles (`admin`, `manager`, `teacher`, `student`) defined in `backend/src/lib/roles.ts`. Admin sees everything; each manager sees only their own team; teachers/students see only their own relationships. Backend scope helpers and frontend `permissions.ts` must stay equivalent.

## Backend

- Guards: `preHandler: app.authenticate` or `app.requireRole([...])` (`backend/src/plugins/auth.ts`); claims at `request.user.sub` / `request.user.role`.
- Scope helpers in `backend/src/lib/scope.ts`:
  - `managerTeam(db, managerId)`: teachers with `teacher_profiles.managerId`, plus students on the manager roster or enrolled with those teachers.
  - `managerOwnsTeacher`, `managerOwnsStudent`, `teacherStudentIds`, `studentTeacherIds`, `adminIds`.
  - `assertCanViewUser(db, actor, targetId)`: admin or self; manager -> team; teacher -> own students; student -> enrolled teachers; else 403.
  - `canAccessAttachment` / `assertCanAccessAttachment(db, actor, attachment)`: per-record read/download scope for `GET /uploads/:id{,/download}`. Admin and uploader (pre-attach window) always pass; request evidence is visible to the target/requesting teacher and their manager; lesson-plan files mirror `GET /school/bootstrap` (manager: published/owned course or a team lesson using the plan; teacher/student: enrolled in the course or assigned to a lesson using the plan). Unreferenced uploads by another user are 403.
- Credit administration is staff-only: `POST /credits` uses `requireRole(["admin", "manager"])`, so student self-purchase is 403. Admin and team-scoped managers keep top-up/adjustment rights under `managerOwnsStudent` and the 100-credit cap.
- Admin creates managers and assigns teachers to managers; role-scoped `GET /school/bootstrap` (`routes/school.ts`) returns only what the actor may see.
- Every route that touches a student/teacher must apply the manager-team check (example: `bookings.ts` before booking on behalf).

## Frontend

- `frontend/app/lib/school/permissions.ts`: `SchoolAction` union + `assertCan(draft, actor, action, target)` (throws `PermissionError`) and `can()` to hide UI. Implements the matrix in `frontend/ADMIN_PLAN.md` section 5. Selectors mirror backend scope (`teachersForUser`, `studentsForUser` in `selectors.ts`).
- In API mode the backend is authoritative; the frontend check is UX only.

When adding a role-sensitive action: add the backend guard + scope check, add the `SchoolAction`, update both branches of the service, and mirror `selectors.ts`.
