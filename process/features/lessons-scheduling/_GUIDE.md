# lessons-scheduling

<!-- Part of Lumina ESL -->

## Scope

1:1, 25-minute lesson lifecycle: teacher slot openings, student bookings (credit debit), lessons (scheduled|live|completed|cancelled, attendance, feedback, scores), meeting links via `lessons.roomCode` (max 40 chars; ClassIn/Zoom/Google Meet, no SDK), cancellation requests and refunds, teacher absences, ratings (student or parent source; parents rate through the student account), homework/assignments, and notifications.

## Key Source Files

Frontend:
- `frontend/app/components/teacher/TeacherBookingSlots.tsx`, `teacher/TeacherLessons.tsx`
- `frontend/app/components/student/StudentLessons.tsx`, `student/LessonRating.tsx`, `student/StudentAssignments.tsx`
- `frontend/app/components/manager/ManagerSchedule.tsx`
- `frontend/app/components/NotificationPanel.tsx`, `frontend/app/lib/school/notifications.ts`
- `frontend/app/lib/school/services/bookings.ts`, `services/teaching.ts`, `services/homework.ts`
- `frontend/app/lib/school/api/bookings.ts`, `api/teaching.ts`, `api/homework.ts`
- `frontend/app/lib/scheduling.ts` (legacy)

Backend:
- `backend/src/routes/bookings.ts` (POST /bookings transaction), `routes/lessons.ts` (cancel ~L638, absence ~L720), `routes/assignments.ts`, `routes/notifications.ts`
- `backend/src/db/schema.ts` -- lessons, slot_openings (unique teacherId+date+time), absences, ratings, assignments
- `backend/src/routes/settings.ts` -- cancellation windows and refund policy

## Planning Docs (stay in place)

- `frontend/CUTOVER_PLAN.md`, `frontend/CUTOVER_PROGRESS.md` (bookings/teaching/homework slices; Step C notifications), `frontend/PROGRESS.md`

## Related Context

- `process/context/database/all-database.md` -- teaching/homework tables
- `process/context/auth/all-auth.md` -- role scoping
- `process/context/uxui/all-uxui.md` -- role workspaces
- `process/context/tests/all-tests.md` -- verification gates

## Current Status

Status: in-progress

Booking, teaching, homework, request withdrawal, and rebooking write paths are API-backed (B2). Smoked: absence before start 400, after start 201 with refund, duplicate absence 409, far cancel refunded, near cancel not refunded, duplicate rating 409. Notifications and uploads remain Step C (not started).

## Risks (observed, not fixed)

- High-risk class: billing/credits (refunds) and scheduling atomicity.
- POST /bookings runs in one transaction; the slot claim (`DELETE slot_openings ... RETURNING`) prevents double-booking of the same slot.
- Balance check is a numeric sum (`getCreditBalance`); fractional hours are exact.
- Balance read and debit are serialized per student by `lockStudentCredits` (advisory transaction lock) and
  cancel/absence decide refunds inside the transaction (Nov 20, 2026). Gate: `e2e/api/credit-concurrency.spec.ts`.
- No unique constraint on lessons (teacher, date, time). Planned in
  `active/booking-collision-refund-policy_20-11-26/`; the dev DB's active duplicates block the migration
  (inventory in that folder).
- Refund rules: student cancel refunds only if hoursUntil >= `studentLateCancellationHours`; teacher absence refunds when `refundTeacherCancellations` and lesson not already cancelled. Frontend local mode mirrors via `LESSON_CREDIT_HOURS`; keep both paths aligned.
- Authenticated business rules lack automated tests.

## Folder Contents

```
process/features/lessons-scheduling/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
