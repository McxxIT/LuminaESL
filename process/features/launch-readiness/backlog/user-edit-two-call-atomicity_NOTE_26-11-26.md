---
name: note:user-edit-two-call-atomicity
description: "Backlog: a frontend person edit is two calls (PATCH /users/:id then PATCH /teachers|/students/:id), so a failure between them leaves a partial save"
date: 26-11-26
feature: launch-readiness
---
# Person edit is two API calls, not one atomic write

status: OPEN, accepted for v1 (partial save is reported honestly)
item: manager-team-edits review, residual "the two-call frontend edit is not atomic"
priority: low-medium. Partial saves are visible and retry-safe, but a retry is still a second pair of writes.

## Gap

- `frontend/app/lib/school/api/school.ts` `updateTeacher` / `updateStudent` first PATCH the account (`name`, and for an admin the email) and then PATCH the profile (`headline`/`specializations`/`bio` or `level`/`targetLevel`/`goal`/guardian).
- If the account PATCH commits and the profile PATCH fails, the store holds the new name but the old profile details. After the manager-team-edits review fix the result carries `{ invite?, warning? }`, so the user is told exactly what was saved and a committed invitation still opens — but the two writes remain separate, and a retry repeats the account PATCH.
- The account PATCH itself is idempotent (unchanged name/email is a no-op), so the retry is safe.

## Options

1. A backend composite endpoint (`PATCH /people/:id` with account + profile parts) in one transaction; needs a new route and contract tests, and duplicates the two existing routes' validation.
2. Client-side compensation (revert the account PATCH when the profile PATCH fails); racy and can undo a concurrent admin edit, not recommended.
3. Keep the two calls and the explicit warning (current state). Add an e2e case for the failure path so the copy cannot silently regress.

## Gate

Option 1: a smoke domain asserting one transaction (account and profile both or neither) plus contract route tests. Option 3: an e2e or vitest case that forces the second PATCH to fail and asserts the warning text plus the invite modal.
