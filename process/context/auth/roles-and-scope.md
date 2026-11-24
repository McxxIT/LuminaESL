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
  - `canAccessAttachment` / `assertCanAccessAttachment(db, actor, attachment)`: per-record read/download scope for `GET /uploads/:id{,/download}`. Admin and uploader (pre-attach window) always pass; request evidence is visible to the target/requesting teacher and their manager; lesson-plan files mirror `GET /school/bootstrap` (manager: published/owned course or a team lesson using the plan; teacher/student: enrolled in the course or assigned to a lesson using the plan). Curriculum Library files (`library_items.attachmentId`) are checked next and only grant access: the item creator and admin always pass; a manager passes for any published item or an item linked to a lesson of a team teacher; a teacher or student passes only for an item linked to their own non-cancelled lesson (completed lessons count). On no match it falls through to the plan block. Unreferenced uploads by another user are 403.
  - Download containment: `backend/src/lib/upload-path.ts` `resolveUploadPath(uploadDir, storageKey)` returns null for empty keys, NUL, `:`, or anything resolving to or outside `UPLOAD_DIR`; `GET /uploads/:id/download` answers 404 (id-only log) on null, so a poisoned legacy `storage_key` cannot read arbitrary files.
- Curriculum Library (`backend/src/routes/library.ts`, all four routes `requireRole(["admin","manager"])`): `POST /library`, `PATCH /library/:id` (edit/archive only by creator or admin), `POST /lessons/:id/library-items` and `DELETE /lessons/:id/library-items/:libraryItemId`. Managers attach only to lessons of their own team; admin to any; teachers and students cannot attach (they read materials on their own non-cancelled lessons). Archive-only (no delete); a concurrent attach retries once then returns 409. The role-filtered bootstrap gives managers `createdByName` for library items but not other managers' user rows.
- Plan attach contract (changed Phase 04): `POST` plan attachment takes a strict `{ attachmentId }` of an existing upload (uploader or admin; request-evidence uploads are 422) and never inserts an `attachments` row, so a client can no longer supply a `storageKey`.
- Credit administration is staff-only: `POST /credits` uses `requireRole(["admin", "manager"])`, so student self-purchase is 403. Admin and team-scoped managers keep top-up/adjustment rights under `managerOwnsStudent` and the 100-credit cap.
- Account creation (account-invites fix): `POST /users` and `POST /users/:id/invite` are admin or manager. A manager creates and invites only teachers and students in their own team (`managerId` forced), resends only for their own team, cannot create admin/manager accounts, and cannot set passwords; only an admin ever sees a copyable invite link. Known gap: `PATCH /users/:id` is admin/self only, so a manager editing an existing team member gets 403 in API mode (backlog `manager-edit-team-member-403_NOTE_25-11-26.md`).
- Admin creates managers and assigns teachers to managers; role-scoped `GET /school/bootstrap` (`routes/school.ts`) returns only what the actor may see.
- Every route that touches a student/teacher must apply the manager-team check (example: `bookings.ts` before booking on behalf).

## Frontend

- `frontend/app/lib/school/permissions.ts`: `SchoolAction` union + `assertCan(draft, actor, action, target)` (throws `PermissionError`) and `can()` to hide UI. Implements the matrix in `frontend/ADMIN_PLAN.md` section 5. Library actions: `library.manage`, `library.edit` (creator or admin), `lesson.attachLibraryItem` (admin, or manager for team-teacher lessons). Selectors mirror backend scope (`teachersForUser`, `studentsForUser` in `selectors.ts`).
- In API mode the backend is authoritative; the frontend check is UX only.

When adding a role-sensitive action: add the backend guard + scope check, add the `SchoolAction`, update both branches of the service, and mirror `selectors.ts`.
