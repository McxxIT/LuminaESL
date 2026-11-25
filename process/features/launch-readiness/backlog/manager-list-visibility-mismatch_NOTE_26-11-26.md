---
name: note:manager-list-visibility-mismatch
description: "Backlog: the frontend manager roster is roster-only while backend managerOwnsStudent also counts enrollment with a team teacher, so a manager can sometimes act on a student they cannot see"
date: 26-11-26
feature: launch-readiness
---

# Manager list visibility narrower than backend ownership

status: OPEN, accepted asymmetry for v1 (documented and pinned, not removed)
item: manager-team-edits review, finding "frontend roster-only visibility vs backend enrollment-broader ownership"
priority: low. The direction is safe (frontend never looser than the backend); only an unreachable target differs.

## Gap

- `frontend/app/lib/school/permissions.ts` `managesTarget` uses the roster (`managerId` on the profile only).
- `backend/src/lib/scope.ts` `managerOwnsStudent` also returns true for a student enrolled with a teacher of the manager's team, even when the student's roster `managerId` is another manager (or null).
- Consequence: a manager can rename or pause such an enrolled-only student through `PATCH /users/:id` (backend 200) while the manager's own list never shows them, so the UI offers no path to the action. The reverse (frontend allows, backend denies) cannot happen.
- The owner-reassignment race is a separate note (`manager-ownership-reassign-race_NOTE_26-11-26.md`).

## Options

1. Widen `managesTarget` to mirror `managerOwnsStudent` (enrollment-derived), so the list and the action agree; needs a selectors/permission test and a UI answer for "students I teach but do not manage".
2. Narrow the backend to roster-only for this route (product decision: does an enrollment grant edit authority?).
3. Keep the asymmetry; the smoke `team-edits` domain proves the backend-broader case (`teStudentB` rename by managerA) so it is documented behaviour, not an accident.

## Gate

Whichever option is chosen: `frontend/tests/permissions.test.ts` matrix row plus the smoke `team-edits` enrolled-only case must agree with the decision.
