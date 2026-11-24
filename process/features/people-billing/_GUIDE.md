# people-billing

<!-- Part of Lumina ESL -->

## Scope

Users and roles (admin, manager, teacher, student; parents are not a login role, guardian fields live on `student_profiles`), two-level staff scoping (admin creates managers and assigns teachers; each manager sees only own teachers/students/approvals; admin sees all), approvals/requests (slot-closure, lesson-cancellation), enrollments, profiles, settings, and the credits ledger / billing (`credit_entries`, fractional hours).

## Key Source Files

Frontend:
- `frontend/app/components/admin/AdminManagers.tsx`, `admin/AdminSettings.tsx`
- `frontend/app/components/manager/ManagerStudents.tsx`, `ManagerTeachers.tsx`, `ManagerApprovals.tsx`, `ManagerProfile.tsx`, `PeopleForms.tsx`, `useApprovals.ts`
- `frontend/app/components/student/StudentBilling.tsx`
- `frontend/app/lib/school/services/people.ts`, `approvals.ts`, `profile.ts`, `credits.ts`
- `frontend/app/lib/school/api/credits.ts`, `api/approvals.ts`, `api/school.ts`
- `frontend/app/lib/school/permissions.ts` (assertCan)

Backend:
- `backend/src/routes/users.ts`, `students.ts`, `teachers.ts`, `requests.ts`, `enrollments.ts`, `credits.ts`, `settings.ts`
- `backend/src/lib/scope.ts` (managerOwnsStudent / managerOwnsTeacher / managerTeam), `lib/roles.ts`, `lib/password.ts`
- `backend/src/db/schema.ts` -- users, teacher_profiles, student_profiles, enrollments, requests, credit_entries, settings

## Planning Docs (stay in place)

- `frontend/ADMIN_PLAN.md` (admin/manager product plan, all phases done), `frontend/CUTOVER_PROGRESS.md` (B2 people/credits slices), `frontend/PROGRESS.md`

## Related Context

- `process/context/auth/all-auth.md` -- roles, JWT, demo accounts
- `process/context/database/all-database.md` -- identity and billing tables
- `process/context/uxui/all-uxui.md` -- role workspaces and component conventions
- `process/context/tests/all-tests.md` -- verification gates

## Current Status

Status: in-progress

B2 people slice is API-backed: manager/teacher/student create and update, status changes, teacher assignment, enrollment, email updates, whole-hour credit creation, approvals, and fractional credits (migration `0001_fractional_credit_hours.sql`). Manager write scoping done (foreign manager read/write 403). Remaining: B3 ownership/parity work. Known demo quirk: `studentCredits` is hardcoded to 24.5 in `LuminaApp.tsx` local state.

## Risks

- High-risk class: billing/credits and auth/identity. Per `process/development-protocols/orchestration.md` section High-Risk Execution Handoff, use `vc-risk-evidence-pack` before closing.
- Credits ledger is append-only (`purchase|booking|refund|adjustment`). Balance reads and debits are
  serialized per student by `lockStudentCredits` (`pg_advisory_xact_lock`, Nov 20, 2026); the numeric balance
  is exact. See `database/booking-and-credit-integrity.md`.
- Scope leaks: every users/students/teachers/requests route must use `lib/scope.ts` checks; a missed check exposes another manager's team.
- Settings is a singleton (id 1) affecting cancellation/refund policy platform-wide.
- Demo accounts use `Password123!` in API mode only; keep demo UI auth separate from real auth.
- Accounts created through the UI are `invited` and set their own password by emailed link (no shared default); see `process/context/auth/jwt-cookie-flow.md`.
- Schema changes require synced Drizzle migrations.

## Folder Contents

```
process/features/people-billing/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
