---
name: note:manager-ownership-reassign-race
description: "Backlog: PATCH /users/:id locks the user row, but a profile/enrollment reassignment that commits after the in-transaction ownership read is not blocked"
date: 26-11-26
feature: launch-readiness
---
# Ownership reassignment race after the in-transaction read

status: OPEN, accepted for v1 (sub-second window, actor-logged, reversible)
item: manager-team-edits known gap 2 (TOCTOU before the manager team-edit write)
priority: low. The window is milliseconds and the consequence is a rename or pause, not data loss.

## Gap

- `PATCH /users/:id` locks the target `users` row with `lockUserForInvite`, then evaluates `managerOwnsInTx` on the locked row.
- Ownership is derived from `teacher_profiles.managerId`, `student_profiles.managerId` and `enrollments` — none of which the user-row lock covers.
- So an admin reassignment (or an enrollment change) that commits after the ownership read but before the update is not serialized against it: the manager can complete one rename or pause on a member who has just left their team.
- Enrollment-derived ownership cannot be `FOR SHARE`-locked without a design change (variable row sets, insert-vs-delete).

## Options

1. Lock the profile row(s) too (`SELECT ... FOR SHARE` on `teacher_profiles` / `student_profiles` / relevant enrollments) inside the transaction; needs a deterministic lock order to avoid deadlocks with the profile routes.
2. Re-check ownership inside the UPDATE (`UPDATE users ... WHERE id = :id` guarded by an `EXISTS` ownership predicate), so a concurrent reassignment makes the update match zero rows and the route can answer 403.
3. Accept the window (current state); the action is activity-logged with the actor and reversible by an admin.

## Gate

Option 1 or 2: a smoke or DB-backed concurrency case (reassign the teacher in parallel with the manager PATCH) asserting either both effects serialize or the loser is 403 with nothing applied. Option 3: keep the residual documented in the report and this note.
