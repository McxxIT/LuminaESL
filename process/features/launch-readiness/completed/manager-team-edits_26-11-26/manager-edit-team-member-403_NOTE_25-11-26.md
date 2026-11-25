---
name: note:manager-edit-team-member-403
description: "Backlog: managers editing existing teachers/students call PATCH /users/:id, which is admin or self only, so the edit returns 403 in API mode"
date: 25-11-26
feature: launch-readiness
---

# Manager cannot edit an existing team member in API mode

status: OPEN, user-chosen follow-up before Phase 06 (next up)
item: account-invites review (also plan known gap `manager-patch-team-member-email`; `users.ts` blocks managers from PATCHing team users, so the team-member status branch is unreachable)
priority: HIGH-ish. Managers can now create team members but not fix them afterwards.

## Gap

- The account-invites fix let managers create and invite teachers and students on their own team. The frontend edit flow for an existing member still PATCHes `/users/:id`, which only an admin or the user themself may call, so the manager gets `403` in API mode.
- Consequence: a manager also cannot correct an invitee's mistyped email.

## Options

- Allow a manager to PATCH name/email/phone of users on their own team (apply `managerOwnsStudent` / `managerOwnsTeacher`, never role or status of admins/managers), or route team edits through the existing teacher/student profile PATCH routes.
- Keep manager-set status changes out of scope unless decided.

## Gate

Smoke manager cases (own team 200, other team 403, admin/manager targets 403) plus an e2e check.
