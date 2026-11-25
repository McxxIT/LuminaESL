---
name: note:manager-edit-team-member-403
description: "Backlog: managers editing existing teachers/students call PATCH /users/:id, which is admin or self only, so the edit returns 403 in API mode"
date: 25-11-26
feature: launch-readiness
---

# Manager cannot edit an existing team member in API mode

status: RESOLVED 26-11-26 by the manager-team-edits fix (plan `manager-team-edits_PLAN_26-11-26.md`, commits `68c9c30` / `fe0cc49`); archived with that task folder
item: account-invites review (also plan known gap `manager-patch-team-member-email`; `users.ts` blocked managers from PATCHing team users, so the team-member status branch was unreachable)
priority: HIGH-ish (was). Managers can now rename and pause/reactivate own-team teachers and students.

## Resolution

- `PATCH /users/:id` now has a manager-team branch (name only, plus pause/reactivate) inside one transaction with the target row locked; email, avatar colour, role, team and archive stay admin-only and are denied with 403 before any database read. See `process/context/auth/roles-and-scope.md`.
- A manager still cannot fix an invitee's mistyped email: that stays admin-only by decision U1. The admin path is now safe and automatic — an admin changing an INVITED person's email expires the old invite and mails a new one (U4).
- Residuals recorded as their own notes: `manager-list-visibility-mismatch_NOTE_26-11-26.md`, `manager-ownership-reassign-race_NOTE_26-11-26.md`, `user-edit-two-call-atomicity_NOTE_26-11-26.md`.

## Gap (historical)

- The account-invites fix let managers create and invite teachers and students on their own team. The frontend edit flow for an existing member still PATCHed `/users/:id`, which only an admin or the user themself could call, so the manager got `403` in API mode.
- Consequence: a manager also could not correct an invitee's mistyped email.

## Options

- Allow a manager to PATCH name/email/phone of users on their own team (apply `managerOwnsStudent` / `managerOwnsTeacher`, never role or status of admins/managers), or route team edits through the existing teacher/student profile PATCH routes.
- Keep manager-set status changes out of scope unless decided.

## Gate

Smoke manager cases (own team 200, other team 403, admin/manager targets 403) plus an e2e check.
