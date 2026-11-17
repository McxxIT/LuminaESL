---
name: context:database-schema-and-models
description: "Tables, enums, relationships, and DB plugin wiring in backend/src/db/schema.ts"
keywords: schema, tables, enums, drizzle, users, lessons, enrollments, slot_openings, credit_entries, settings, manager
related: [context:all-database]
date: 17-11-26
---

# Schema and Models

BLUF: All tables are defined in `backend/src/db/schema.ts` (~520 lines). Ids are `uuid` (`defaultRandom`), most tables have `createdAt/updatedAt` timestamps (timestamptz). Manager "team" is expressed by `managerId` on `teacher_profiles` and `student_profiles`.

## Enums (pgEnum)

`school_role` admin|manager|teacher|student; `user_status` active|paused|archived; `course_status` draft|published|archived; `enrollment_status` active|paused|completed|ended; `lesson_status` scheduled|live|completed|cancelled; `lesson_attendance` attended|no-show; `request_status` pending|approved|rejected; `request_type` slot-closure|lesson-cancellation; `rating_source` student|parent; `assignment_state` assigned|submitted|reviewed; `homework_type` recording|quiz|reading|writing; `credit_reason` purchase|booking|refund|adjustment.

## Tables by domain

- Identity: `users` (unique email, `passwordHash`, `role`), `refresh_tokens` (sha256 `tokenHash` unique, `expiresAt`, `revokedAt`, cascade on user), `teacher_profiles`, `student_profiles` (unique `userId`, `managerId` set-null; guardian fields live on student profile — parents are not a login role).
- Curriculum: `courses`, `course_units`, `lesson_plans`, `attachments`.
- Teaching: `enrollments` (has `nextPlanIndex`), `lessons` (status, attendance, `roomCode` max 40 chars — NOT `meeting_url`, feedback, scores), `slot_openings` (unique index teacher+date+time), `requests`, `absences`, `ratings`.
- Homework: `assignments`.
- Billing: `credit_entries` — append-only ledger, `hours numeric(8,2)` (fractional since migration 0001).
- System: `activity` (audit feed), `settings` (singleton row id 1: onTheSpotCancellationHours 12, studentLateCancellationHours 24, bookingDayStart/End, performanceWindowDays, refundTeacherCancellations).

Indexes: `users_role_idx`, `refresh_tokens_user_idx`, `lessons_teacher_date_idx`, `lessons_student_date_idx`, `enrollments_*_idx`, `assignments_*_idx`, `credit_entries_student_idx`, etc.

## Runtime wiring

- `backend/src/plugins/db.ts` creates `postgres(url, {max: 10})` + `drizzle(client, {schema})`, decorates `app.db`, closes on `onClose`. The driver connects lazily (tests need no DB).
- Types exported from schema (e.g. `User`) are used by routes; the frontend mirrors shapes in `frontend/app/lib/school/types.ts` (see migrations-workflow.md).
