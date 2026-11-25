# curriculum

<!-- Part of Lumina ESL -->

## Scope

Courses, course units, lesson plans, and plan progression for enrollments (`enrollments.nextPlanIndex`: each booked 1:1 lesson receives the next lesson plan). Also covers the PLANNED, NOT BUILT Curriculum Library: admins upload materials, teachers attach them to bookings, students/parents view them. Lesson-plan attachments and an uploads route exist today; the Library itself depends on cutover Step C (uploads).

## Key Source Files

Frontend:
- `frontend/app/components/manager/ManagerCurriculum.tsx`, `manager/CurriculumForms.tsx` -- curriculum UI and forms
- `frontend/app/lib/school/services/curriculum.ts`, `services/uploads.ts` -- services (API/local branches)
- `frontend/app/lib/school/api/curriculum.ts` -- API client
- `frontend/app/lib/school/files.ts` -- file helpers

Backend:
- `backend/src/routes/courses.ts` -- courses, units, plans, publish/archive guards
- `backend/src/routes/uploads.ts` -- multipart uploads (25MB, 1 file, `UPLOAD_DIR`)
- `backend/src/db/schema.ts` -- courses, course_units, lesson_plans, attachments, enrollments

## Planning Docs (stay in place)

- `frontend/ADMIN_PLAN.md`, `frontend/CUTOVER_PLAN.md`, `frontend/CUTOVER_PROGRESS.md` (Step C uploads)

## Related Context

- `process/context/database/all-database.md` -- curriculum tables
- `process/context/auth/all-auth.md` -- manager scoping of courses
- `process/context/uxui/all-uxui.md` -- manager UI conventions

## Current Status

Status: in-progress

Curriculum CRUD, publish/archive, plan attachments, and course duplication are migrated to the API (B2). Rules enforced (smoked): publish with no plan 400; archive with enrollments 409; delete attached plan 409; delete unit with plans 409; delete last unit 409. Curriculum Library: not started (planned).

## Risks

- Library requires Step C upload/storage design (local `UPLOAD_DIR` only; no external storage yet).
- Plan progression (`nextPlanIndex`) is advanced on booking; cancellations/refunds must not skip or repeat plans (verify before changing).
- Course visibility is manager-scoped; foreign manager access returns 403.
- Any schema change needs a Drizzle migration.

## Folder Contents

```
process/features/curriculum/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
