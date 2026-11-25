---
name: plan:manager-team-edits
description: "Pre-Phase-06 fix: managers may rename and pause/reactivate their own team's teachers and students through PATCH /users/:id; admin email changes end sessions (active) or re-invite (invited); transactional PATCH; frontend manager edit path"
date: 26-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: pre-06
---

# Manager Team Edits — Managers Edit Their Own Team Members (PATCH /users/:id)

Date: 26-11-26
**Related program:** lumina-v1-finish (standalone fix that runs after the account-invites fix and BEFORE Phase 06)
**Umbrella plan (context only, not modified by this plan):** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Backlog item closed:** `process/features/launch-readiness/completed/manager-team-edits_26-11-26/manager-edit-team-member-403_NOTE_25-11-26.md` (HIGH-ish; moved here from backlog when resolved). Also closes item 9 of `account-invites-review-residuals_NOTE_25-11-26.md` for the manager side (a manager cannot fix an invitee's mistyped email: stays admin-only BY DECISION U1; the admin path is made safe and automatic by U4).
Complexity: COMPLEX (authorization/identity + session handling + public API contract + transactional rewrite of an existing route + both workspaces; NO schema change, NO new dependency)
Status: VERIFIED 26-11-26 — Steps A-E executed, EVL green, review APPROVE WITH CONCERNS, review findings N1/N2 fixed and committed (`68c9c30`, `fe0cc49`, `5ee5f9f`); archived in `process/features/launch-readiness/completed/manager-team-edits_26-11-26/`
**Report destination:** process/features/launch-readiness/completed/manager-team-edits_26-11-26/manager-team-edits_REPORT_26-11-26.md
**High-risk evidence pack:** process/features/launch-readiness/completed/manager-team-edits_26-11-26/harness/manager-team-edits/ (5 JSON artifacts, same shape as `lumina-v1-finish_23-11-26/harness/phase-03-auth/`: adversarial-validation, context-snippets, review-decision, risk-gate, verification)

TL;DR: Today a manager editing a teacher or student on their own team gets `403` in API mode, because `PATCH /users/:id` is admin-or-self only. After this fix a manager can change ONLY the name of an own-team teacher/student and pause or reactivate them (archive stays admin-only; email, avatar, role and team stay admin). In the same rewrite the route becomes one transaction with the target row locked: an admin changing an ACTIVE person's email signs them out, an admin changing an INVITED person's email expires the old invite and mails a new one to the new address, and a duplicate-email race answers `409` instead of `500`. No schema change. No real email is sent by any gate.

---

## Overview and Context

Standalone COMPLEX fix scheduled after account-invites (VERIFIED, execution commit 1940ea6, archived) and BEFORE Phase 06. SPEC skipped and INNOVATE compressed by user decision (26-11-26); the user decisions below are the locked requirements. Context routers read 26-11-26: `process/context/all-context.md`, `process/context/auth/{roles-and-scope,jwt-cookie-flow}.md`, `process/context/uxui/school-data-layer.md`, `process/context/tests/all-tests.md` (the whole test guide; no deeper test docs exist). Backlog read: `manager-edit-team-member-403`, `account-invites-review-residuals`, `per-sender-invite-limit`, `access-token-revocation`.

## Phase Completion Rules

CODE DONE means Steps A-E are implemented and the exit gates are green in EXECUTE. VERIFIED requires the independent vc-tester EVL confirmation run, the regression list green, the high-risk evidence pack written, and the report written. There is no user-gated hard-stop step (no real mail is ever sent), so a fully green EVL run can be marked VERIFIED. The two residuals under "Known-Gap residuals" are recorded with backlog stubs and never counted as PASS.

## Purpose

1. A manager can edit the NAME of a teacher or student on their own team, and pause or reactivate them, in API mode (today: 403).
2. A manager can still never touch email, avatar color, role or team of another user, never archive, never restore an archived account, and never learn whether a user id outside their team exists.
3. `PATCH /users/:id` becomes one transaction with the target user row locked (same row-lock-then-ownership precedent as `POST /users/:id/invite`), so ownership, status, email uniqueness, invite expiry, session revocation, activity and the update are atomic.
4. Admin email changes get the missing security semantics: ACTIVE person -> their refresh tokens are revoked in the same transaction; INVITED person -> the old invites expire and a new invite is issued and mailed to the new address.
5. The frontend manager path works end to end (name-only user PATCH, then the existing profile PATCH; Email field disabled for managers; Pause/Reactivate work), and the admin edit of an invited person shows the invite result.
6. Demo mode keeps working and mirrors the same rules (managers name-only), so demo and API stay in parity.

Out of scope (stated so EXECUTE does not drift): the per-actor invite limit (next follow-up `per-sender-invite-limit_NOTE_25-11-26.md`; sequential, see Blast Radius overlap); the public `POST /auth/register` decision (`public-self-register-decision_NOTE_25-11-26.md`); the manager list-visibility mismatch (frontend `managesTarget` is roster-only, backend `managerOwnsStudent` also counts enrollment with a team teacher; kept as the documented "frontend never looser than backend" asymmetry, backlog stub written); making the access-token window shorter (`access-token-revocation_NOTE_24-11-26.md`, unchanged: an issued access token still lives up to 15 minutes after a pause or email change); changing activity storage (past activity text keeps old names, user decision U5); any schema, env or dependency change; a UI to archive (none exists for any role); manager-created email or avatar edits; bulk edits.

---

## Locked Decisions (authoritative; no creative decisions at EXECUTE)

### User decisions 26-11-26 (Decision Summary; INNOVATE compressed by the user)

| # | Decision |
|---|---|
| U1 | Managers may change ONLY the NAME of teachers/students on their own team on the user record (plus the profile fields `teachers.ts` / `students.ts` already allow them). Email, avatarColor, role and managerId stay admin (or self where already allowed). A manager sending `email` or `avatarColor` for another user gets `403`. |
| U2 | Managers may PAUSE and REACTIVATE own-team teachers/students. ARCHIVE stays admin-only (manager `status: "archived"` -> `403`). A never-activated (invited, unusable hash) member keeps the existing `409 ACCOUNT_NOT_ACTIVATED` for `active`/`paused`. |
| U3 | When an ADMIN changes an ACTIVE person's email, that user's refresh tokens are revoked (signed out) in the same transaction; the activity log records it. |
| U4 | When an ADMIN changes an INVITED person's email, the old invites expire and a new invite is issued automatically to the new email (resend-cooldown handling is decided in D8; mail goes out after commit; admin-only link exposure rules unchanged). |
| U5 | Names stay required and hand-typed; a rename updates live screens only (past activity text keeps the old names); activity storage does not change. |
| U6 | Backend team scope = the existing `managerOwns*` semantics, evaluated INSIDE the transaction after locking the target user row (`managerOwnsInTx` / `lockUserForInvite` precedent). The frontend keeps roster-only scope (never looser than the backend). |

### Plan decisions (deviations from the compressed INNOVATE are marked DEVIATION)

| # | Decision |
|---|---|
| D1 | Access matrix, one pure function `userPatchAccess({ actorRole, isSelf, bodyKeys, bodyStatus })` in new `backend/src/lib/user-edit-policy.ts` returning `{ kind: "deny", message? } \| { kind: "admin" } \| { kind: "self" } \| { kind: "manager-team" }`. Rules, in this order: (1) admin -> `admin` (all fields, as today); (2) isSelf -> `self`, with today's rule kept verbatim: a non-admin self sending `status` is `403 "Only admins can change this account status"` (users.ts:431-446 behavior for self); self may change name, email, avatarColor exactly as today; (3) manager and not self -> `manager-team` only when every present key is in `{name, status}` and `status` is `active` or `paused`; any `email`/`avatarColor` key -> deny `"Managers can only change a team member's name, or pause and reactivate them"`; `status: "archived"` -> deny `"Only admins can change this account status"`; (4) teacher/student and not self -> deny plain `forbidden()` (today's behavior, no DB read). Zod keeps stripping unknown keys (`role`, `managerId` never reach the route for anyone, as today); a body that is empty after stripping stays `400 "No fields to update"`. |
| D2 | Check order and the no-oracle rule (mirrors `POST /users/:id/invite`, users.ts:376-419): authenticate -> parse id and body (400) -> `userPatchAccess` static deny (403, before any DB read; also covers a manager sending a forbidden key at ANY target) -> empty body 400 -> transaction: `lockUserForInvite(tx, id)` (row lock; reused as is) -> target missing: manager gets `403` (same body as out-of-team), admin gets `404 "User not found"` (unchanged) -> manager non-self: `managerOwnsInTx(tx, actor.sub, target)` else `403` (covers unknown, other team, admin and manager targets, non-teacher/student: all the identical `forbidden()` default message) -> archived target and manager: `403` (D4). A manager can therefore never distinguish an unknown id from a foreign one. |
| D3 | The whole PATCH is ONE `db.transaction`: lock, ownership, status checks, email duplicate pre-check, the `UPDATE`, invite expiry/issue, refresh revocation and every `logActivity(tx, ...)` run on `tx`. Today the revoke and the activity rows run on `app.db` AFTER the commit (users.ts:513, 516, 525, 536) and the unique violation on the update is not caught; both are fixed. Mail is sent only after commit via `deliverInvite`. Lock order everywhere stays users row first, then `auth_tokens` / `refresh_tokens`, matching `set-password`, resend and delete (no deadlock). |
| D4 | DEVIATION (safety consequence of U2, not a new product rule): a manager may never mutate an ARCHIVED target at all (`403`, name or status). Without this, `status: "active"` from a manager would silently undo an admin's archive, defeating "archive stays admin-only". A manager's allowed status transitions are therefore exactly active -> paused and paused -> active; invited targets answer the existing `409` for `active`/`paused` (D5). Admins are unchanged (they may reactivate an archived account, as today). |
| D5 | Never-activated rule unchanged and now evaluated on the locked row: `status` `active`/`paused` on a user whose `passwordHash` is unusable (`isUnusablePasswordHash`) -> `409 ACCOUNT_NOT_ACTIVATED` for admin and manager alike. A manager may still RENAME an invited team member (name only). |
| D6 | Email-change semantics use an EFFECTIVE change: `body.email !== undefined && body.email !== before.email` (zod already lowercases; stored emails are lowercase). The frontend always sends the form email, so an unchanged email must be a pure no-op: no revocation, no re-invite, no `user.email_changed` row. The duplicate pre-check runs only for an effective change, scoped `id <> :id`. The `UPDATE` is wrapped so `isUniqueViolation` throws `conflict("Email is already registered")` inside the transaction (rollback), so a `Promise.all` race answers one `200` + one `409`, never `500`. |
| D7 | Admin changes an ACTIVE person's email (admin actor, not self, effective change, `before.status === "active"`): `revokeUserRefreshTokens(tx, id, now)` in the same transaction; activity `user.email_changed` summary `"<name> (email changed, signed out)"`. Decision on paused/archived/invited targets: no revocation needed (tokens already revoked at pause/archive; an invited user has none). An already-issued access token lives up to 15 minutes (existing `access-token-revocation` note, unchanged; Known-Gap residual 1). |
| D8 | Admin changes an INVITED person's email (admin actor, effective change, `before.status === "invited"`): in the same transaction, after the UPDATE, `issueInvite(tx, id, { now, cooldownSeconds: 0 })` (it expires older open invites itself; see D19(d)/(e)); after commit `deliverInvite({ ..., user: { name, email: <new email> }, actorRole: actor.role })`; the response is `{ ...publicUser(updated), invite }`. COOLDOWN DECISION: the 30 s resend cooldown (mail-bombing guard for the Resend button) is BYPASSED here, exactly like `POST /users` (users.ts:155 passes `cooldownSeconds: 0`), because the recipient is a new address and the old invite was just expired: the typo-fix flow ("create, notice a typo, fix the email within seconds") must not be blocked by `429`. The mail-volume guard for this path is the admin-only access plus the per-IP route limit now, and the per-actor limit in the next follow-up (`per-sender-invite-limit`, which counts `user.invite_resent` rows; D11 writes one so it is countable). Link exposure is unchanged: `shouldExposeInviteLink` (admin only, never for managers; a manager cannot reach this path anyway because managers cannot send `email`). Residual (accepted): with cooldown 0 an admin's invited-email change is the one new mail vector; bounded only by admin-only access plus the per-IP route limit until `per-sender-invite-limit` lands; compromised-admin mail volume accepted. A send failure after commit is `invite.sent:false` + the generic error; the email change and the open token stay committed; the admin uses Resend. |
| D9 | Self email change is unchanged: the person stays signed in, no revocation, no invite (U3/U4 are about an ADMIN changing someone else's address). An admin editing their own email follows the self path. |
| D10 | Refresh revocation on a status change stays as today (revoke when `before.status === "active"` and the status changes), now inside the transaction; a manager pause therefore revokes the member's refresh tokens. Pause also keeps `expireOpenInvites` (users.ts:498-504 behavior). Reactivation revokes nothing. |
| D11 | Activity rows (all via `logActivity(tx, ...)`): status change -> `user.${status}` (unchanged); name change -> `user.renamed` `"<old> → <new>"` (unchanged; keep the existing U+2192 arrow verbatim, not ASCII `->`; U5: no history rewrite); effective email change -> NEW action `user.email_changed` (summary per D7/D8, or `"<name> (email changed)"` for self; NEVER an email address); the generic `user.updated` row is now only written when `avatarColor` changed and neither status nor email nor name row applies (an email change no longer produces `user.updated`). When D8 issues an invite, ALSO write `user.invite_resent` (actor = the admin, targetId = the user), so every issued invite is countable by the next follow-up. `backend/src/lib/activity.ts` gains `user.email_changed`. The frontend label map (`notifications.ts:136-188`) is NOT touched: unknown actions fall back to `prettify(entry.action)` (notifications.ts:248), same as `user.invite_resent` today. |
| D12 | Response contract: `200` with the public user; plus `invite: InviteOutcome` ONLY when D8 issued an invite. Errors: `400` (validation / empty body), `403` (D1/D2/D4), `404` (admin, unknown id), `409 CONFLICT` (duplicate email), `409 ACCOUNT_NOT_ACTIVATED` (D5). No new error codes. |
| D13 | Frontend API layer (`frontend/app/lib/school/api/school.ts`): `updateUser(userId, { name, email? })` sends `{ name }` only when the session is not an admin (`getSessionSnapshot().user?.role`), and `{ name, email }` (trimmed, lowercased, only when truthy) for an admin; it returns `{ invite?: InviteOutcome }` read from the response. Service return types: `updateTeacher` / `updateStudent` / `updateManager` -> `ServiceCall<{ invite?: InviteOutcome }>`; local branches return `ok({})`; the three callers to adapt are `ManagerTeachers.tsx:101`, `ManagerStudents.tsx:225` and `AdminManagers.tsx:116`; run `npm run typecheck` BEFORE wiring the form components. The `finally` refresh is wrapped in `try/catch` so it can never mask the original `ApiError`. No frontend notification label and no `NOTIFICATION_CATEGORIES` change is needed (the `prettify` fallback applies); only `user.email_changed` is added to the backend `ActivityAction` union. ORDER decision for `updateTeacher`/`updateStudent`: keep "user PATCH first, profile PATCH second" (the user PATCH carries the likely failures: duplicate email, validation, ownership), and make a partial failure honest instead of reordering: if the profile PATCH fails after the user PATCH succeeded, throw an `ApiError` that keeps the original `status`/`code` and whose message is `"Name and email were saved, but the profile details were not: <original message>. Try again."`; the service layer calls `refreshSchoolAfterCommand()` in a `finally` (errors from that refresh are swallowed so they cannot mask the first error) so the UI shows what was saved. A manager always PATCHes the user record (name only) even when the name is unchanged: the backend treats an unchanged name as a no-op `200` with no activity row (smallest safe option; no extra "previous name" plumbing). |
| D14 | Frontend UI: `TeacherFormModal` and `StudentFormModal` (PeopleForms.tsx:83, 130) gain `lockEmail?: boolean` and `emailNote?: string` props. In EDIT mode for a non-admin the Email input is rendered `disabled` with the note "Only an admin can change an email address." (`data-testid="email-locked-note"`); for an admin editing an INVITED person the note reads "Changing the email sends a new invitation to the new address." Create mode is unchanged (managers still type the email of a new invitee). The `ManagerFormModal` (admin-only, PeopleForms.tsx:63) gets the same invited-note only. No Archive control exists for any role (verified by grep), so nothing is hidden for archive. Pause/Reactivate stay as they are (`ManagerTeachers.tsx:158`, `ManagerStudents.tsx:182`, gated by `teacher.manage`/`student.manage`). After an admin edit that returns `invite`, the screen opens the existing `InviteResultModal` (`ManagerTeachers.tsx:72,85`, `ManagerStudents.tsx:101,129`, `AdminManagers.tsx:50,110`) for the new address. |
| D15 | Demo/local parity: in the local branches of `updateTeacher` and `updateStudent` (people.ts:157-179, 265-281) an actor with role `manager` may not change the email: when the normalized input email differs from the stored email the service answers `ServiceError("Only an admin can change an email address.")`; an unchanged email passes (the disabled form still submits it). Name and profile edits stay allowed for managers; `setPersonStatus` local branch (people.ts:333-350) already lets a manager pause/reactivate own-team people and no archive exists. `updateManager` stays admin-only. |
| D16 | Name rule parity: the API branches of `updateTeacher`/`updateStudent` now pass `cleanName(input.name)` (people.ts:35-39: trim, collapse whitespace, minimum 2 characters, same as the local branch and as `createTeacher` line 123). The backend schema stays `min(1)` (other clients, admin tooling); no backend change. |
| D17 | Permissions: `frontend/app/lib/school/permissions.ts` is NOT changed. `teacher.manage` / `student.manage` already resolve to `isAdmin \|\| ownsAsManager` (permissions.ts:96-104) with the roster-only `managesTarget` (66-71). New unit tests pin that matrix (none exists today) including the intentional asymmetry (a student enrolled with a team teacher but on another manager's roster: frontend `false`, backend true). |
| D19 | PVL cycle 1 execution rules for the PATCH rewrite (B1), binding: (a) the before-row is the LOCKED row from `lockUserForInvite` (delete the pre-transaction SELECT at ~users.ts:452-460 and the `managerOwns*` pre-check at ~431-447); (b) `userPatchAccess` static deny runs before any DB call and the empty-body 400 before the transaction; (c) manager + (target missing OR `!managerOwnsInTx`) -> bare `forbidden()` identical to the invite route; admin + missing -> `notFound("User not found")`; (d) `revokeSessions` / `reinvite` / `expireInvites` are computed from the pre-update LOCKED row (`before.status`, `before.email`), never from the RETURNING row; `issueInvite` is called AFTER the UPDATE inside the tx (it expires older invites itself, so the extra `expireOpenInvites` before it may be dropped); the NEW email passed to `deliverInvite` comes from the RETURNING row; rely on `issueInvite`'s invited-only guard; (e) if the body also sends `status: "archived"` together with an invited email change: expire open invites only, NO reinvite (`issueInvite` throws for non-invited); (f) the UPDATE catch maps `isUniqueViolation` -> `conflict("Email is already registered")` and NO further tx statement runs after a caught PG error; (g) statement order: `users FOR UPDATE` -> ownership SELECTs -> `UPDATE users` -> invites -> `revokeUserRefreshTokens(tx)` -> `logActivity(tx)`; never touch `auth_tokens`/`refresh_tokens` before the user lock; (h) D6 compare is `body.email !== before.email.toLowerCase()` on the locked row; EXECUTE greps the `createUser`, import and seed writers to confirm stored emails are lowercased and records the result in the report (if not, note it; NO schema change). The `user.renamed` summary keeps the existing `→` (U+2192) character verbatim (D11; do not replace it with ASCII `->`). (i) `bodyKeys` passed to `userPatchAccess` are the defined keys of the PARSED (post-strip) body: a manager body with only unknown keys has an empty key set, passes the static check vacuously, and then hits the empty-body `400 "No fields to update"` (PVL cycle 2). |
| D18 | No schema change, no migration, no new dependency, no new env key, no new route. `git status --porcelain -- backend/src/db` must be empty. Real mail is never sent: smoke uses the array mailer, Playwright uses the log mailer (both already wired by account-invites). |

---

## HARD STOPS (the plan must stop and ask; none of these is an EXECUTE step)

1. Any real email send. This plan has no real-SMTP step. Smoke uses the injected array mailer, Playwright the `log` mailer; `createMailer` already refuses `smtp` under `NODE_ENV=test`.
2. Any `db:reset`, `db:push`, `TRUNCATE`, `db:migrate` or other data mutation on dev `lumina` other than what the smoke and e2e suites already do with their own `smoke-{runId}-*` / `e2e-*` fixtures. This plan adds no migration.
3. Printing, logging, committing or copying any secret, token, invite link or email body. Agents never read `backend/.env` or `backend/.env.example` (privacy hook).
4. Before running `npm run e2e`: ports 3000, 3100 and 4000 must be free (`netstat -ano | findstr ":3000 :3100 :4000"` prints no listener). If anything listens on 4000, STOP and ask: the API Playwright config reuses an existing backend and one started from `backend/.env` could be in `smtp` mode.
5. Any step that would need a schema change, a new route, or widening manager rights beyond U1/U2 (email, avatar, archive, restoring an archived account, other teams). That is a new decision: stop and ask.

---

## Entry Gate

- account-invites VERIFIED and archived (execution commit 1940ea6; process commits after it); working tree: only `frontend/AGENTS.md` modified (auto-managed by `next dev`, never edited or committed by this plan).
- Migrations `0001`-`0007` applied on dev `lumina`; this plan adds none (next free number stays `0008`).
- Baselines to keep or beat (from `process/context/tests/all-tests.md`, re-verified by EVL): backend vitest 12 files / 98 tests; frontend vitest 11 files / 62 tests; smoke 17 domains / 835 checks; e2e 30 API + 5 demo.
- Code anchors verified 26-11-26 (see Resume and Execution Handoff).

---

## Backend Design

### New and changed modules

| File | Role |
|---|---|
| `backend/src/lib/user-edit-policy.ts` (new, pure, no DB) | `userPatchAccess(...)` (D1); `planUserPatchEffects({ actorRole, isSelf, before: { status, email, name, passwordUnusable }, body: { name?, email?, avatarColor?, status? } })` returning `{ emailChanged, nameChanged, statusChanged, avatarChanged, revokeSessions, expireInvites, reinvite }` per D6-D10; `emailChangeSummary({ name, outcome: "signed-out" \| "invited" \| "plain" })` returning the fixed strings of D7/D8/D11 (never contains an address). |
| `backend/src/routes/users.ts` (PATCH `/:id`, currently lines 421-547, rewritten) | Uses the policy functions, the single transaction (D3), `lockUserForInvite` (import already present at line 25), `managerOwnsInTx` (users.ts:173-207, unchanged), `expireOpenInvites`, `issueInvite`, `revokeUserRefreshTokens` (import already present at line 37), `deliverInvite`. The now-unused imports `managerOwnsStudent` / `managerOwnsTeacher` (users.ts:40-41) are removed only if nothing else in the file uses them (EXECUTE greps first; `managerTeam` stays for the list route, line 243). `updateUserSchema` (81-89) is unchanged. |
| `backend/src/lib/activity.ts` (line 13-60 union) | add `"user.email_changed"` (D11). |
| `backend/src/lib/invites.ts` | NOT changed (reuse `lockUserForInvite`, `expireOpenInvites`, `issueInvite`, `deliverInvite`, `shouldExposeInviteLink` as they are). |

### Route behavior (PATCH `/api/v1/users/:id`, guard `app.authenticate`, unchanged)

Order of operations (exact; no creative decisions):

1. Parse `id` (uuid) and body with `updateUserSchema` (400 on failure).
2. `userPatchAccess(...)`: `deny` throws `forbidden(message?)` BEFORE any database read (D1, D2). `admin` / `self` / `manager-team` continue.
3. Empty parsed body -> `400 "No fields to update"`.
4. `const now = new Date();` open `app.db.transaction(async (tx) => { ... })`:
   a. `target = await lockUserForInvite(tx, id)`; missing -> manager: `forbidden()`, otherwise `notFound("User not found")`.
   b. kind `manager-team`: `managerOwnsInTx(tx, actor.sub, target)` else `forbidden()`; `target.status === "archived"` -> `forbidden()` (D4).
   c. D5: `(body.status === "active" || "paused") && isUnusablePasswordHash(target.passwordHash)` -> `notActivated()` (existing helper, users.ts:94).
   d. `planUserPatchEffects(...)`; if `emailChanged`: duplicate pre-check on `tx` (`email = :new AND id <> :id`) -> `conflict("Email is already registered")`.
   e. `UPDATE users SET ... WHERE id = :id RETURNING *` inside `try`; `isUniqueViolation` -> `conflict(...)` (D6); keys set only when present; `updatedAt = now`.
   f. Effects in order (flags from the LOCKED before-row, D19): `expireOpenInvites` when `expireInvites` and NOT `reinvite`; when `reinvite` `issueInvite(tx, id, { now, cooldownSeconds: 0 })` after the UPDATE (keeps the raw token for the mail; it expires older invites itself); `revokeUserRefreshTokens(tx, id, now)` when `revokeSessions` or (D10) a status change from `active`.
   g. Activity rows per D11 (`logActivity(tx, ...)`), including `user.invite_resent` when `reinvite`.
   h. return `{ row, token }`.
5. After commit, when a token was issued: `deliverInvite({ mailer: app.mailer, env: app.config, log: request.log, user: { name: row.name, email: row.email }, token, actorRole: actor.role })` and respond `{ ...publicUser(row), invite }`; otherwise `publicUser(row)`.

Failure model: any throw in step 4 rolls back everything (no partial rename, no revoked sessions without the email change, no expired invite without the new one). A mail failure after commit is `invite.sent:false`, never a rolled-back edit.

### Logging and secrets rules (apply to every new/changed backend file)

Never log tokens, links, email bodies or addresses; activity summaries never contain an email address (`emailChangeSummary`); client-visible errors stay the existing fixed sentences. The Step E logging grep gate from account-invites is re-run on `backend/src/routes/users.ts` and `backend/src/lib/user-edit-policy.ts` (no new matches).

---

## Frontend Design

### Data layer and API

- `frontend/app/lib/school/api/school.ts`: `updateUser` (lines 76-81) returns `Promise<{ invite?: InviteOutcome }>` and shapes the body by session role (D13; `isAdminSession` exists at 72-74); `updateTeacher` (113-124) and `updateStudent` (140-143) return `{ invite? }` and wrap the profile PATCH in the partial-failure rethrow (D13). `CreatedUser` (line 51) is reused as the PATCH response type. `setUserStatus` (91-96) is unchanged (it now simply succeeds for an own-team manager).
- `frontend/app/lib/school/services/people.ts`: `updateTeacher` (157-179) and `updateStudent` (265-281) return `ServiceResult<{ invite?: InviteOutcome }>`; the API branch passes `cleanName(input.name)` (D16), calls `refreshSchoolAfterCommand()` in `finally` (D13) and returns the invite; the local branch applies the D15 manager-email rule (compare `cleanEmail`-normalized input to the stored email BEFORE `cleanEmail`, which also checks uniqueness) and returns `{}`; `updateManager` (377-390) returns `{ invite? }` the same way (admin-only; an invited manager's email change re-invites).
- `frontend/app/lib/school/permissions.ts`: unchanged (D17).

### UI

- `frontend/app/components/manager/PeopleForms.tsx`: `lockEmail` / `emailNote` props on `TeacherFormModal` (Email input line 83) and `StudentFormModal` (line 130) and the invited-note on `ManagerFormModal` (line 63) per D14. Create mode untouched.
- `ManagerTeachers.tsx` (edit dialog 203-206, `submitEdit` 100-104), `ManagerStudents.tsx` (edit dialog 225-229), `AdminManagers.tsx` (edit at ~116): pass `lockEmail={!isAdmin}` and, for an invited person, the invited note; after a successful edit with `result.value.invite`, `setInviteResult({ person: { ...person, email: <new email> }, invite })` so the existing `InviteResultModal` opens. The success notice (`"<name> was updated."`) is unchanged.
- No CSS file changes (the disabled input and the `<small>` note reuse existing form styles; EXECUTE verifies at 390 px, AC-16).

---

## Data Flow and Failure Modes (architecture note, prose)

Manager rename: the browser (API mode, manager session) calls `PATCH /users/:id {name}`; the route rejects forbidden shapes before touching the database, then opens a transaction, locks the target row, confirms the target is a teacher/student on the manager's team and not archived, updates the name, writes the `user.renamed` activity row and commits; the browser then calls the existing `PATCH /teachers/:id` or `/students/:id` for profile fields and refreshes the store. Manager pause: same locked path with `status: "paused"`; on commit the member's refresh tokens are revoked (same transaction) so they cannot refresh; an already-issued access token lives up to 15 minutes (accepted, existing note). Admin email change on an active user: lock, effective-change check, duplicate check, update, revoke refresh tokens, `user.email_changed` row, commit; the person must sign in again with the new address. Admin email change on an invited user: lock, update, expire open invites, issue a new token (cooldown bypassed), two activity rows, commit, then mail the new address; the old link is dead from the commit on.

| Failure | Behavior |
|---|---|
| Duplicate email (pre-check or race) | `409 CONFLICT`; nothing changed: no rename, tokens intact, invites intact (rollback); two concurrent edits to the same new address: one `200`, one `409`, never `500` |
| Manager targets unknown id / other team / admin / manager / non-teacher-student | identical `403` (no existence oracle) |
| Manager sends `email` or `avatarColor` (any target) or `status: "archived"` | `403` before the database is read; nothing applied (including a `name` sent alongside) |
| Manager reactivates or renames an archived member | `403`; the archive is not undone |
| Manager pauses/reactivates a never-activated member | `409 ACCOUNT_NOT_ACTIVATED` |
| Ownership changes between the manager's click and the write (admin reassigns the teacher) | ownership is read inside the locked transaction; a reassignment that commits in the sub-second window after the read is not blocked (Known-Gap residual 2, same class as the invite route) |
| SMTP down on the re-invite after an invited-email change | edit and token committed; `invite.sent:false` + generic error; admin presses Resend (cooldown applies there) |
| Profile PATCH fails after the user PATCH (frontend two-call edit) | the user part stays saved; the UI says exactly which part was saved; the store is refreshed; retry is idempotent |
| Admin edits an email to the same value the form sent | no-op: no revocation, no re-invite, no email_changed row |
| Admin changes the email of a paused user | updated; no revocation (already revoked), no invite |
| Process dies between commit and mail (invited path) | user keeps the new email and one open token nobody received; admin sees "Invited" and presses Resend |

---

## Security (STRIDE scan, vc-security equivalent; auth/identity surface)

| Threat | Mitigation in this plan |
|---|---|
| Elevation: manager changes a teammate's email to take over or lock out the account | email is admin-only (U1/D1); static 403 before any read; smoke asserts no partial write |
| Elevation: manager undoes an admin archive via `status: "active"` | D4 (archived target always 403 for managers) |
| Elevation: manager acts on another team or on admin/manager accounts | ownership read inside the locked transaction (D2); only teacher/student targets can ever match `managerOwnsInTx` |
| Information disclosure: id/ownership oracle | identical `403` for unknown, foreign, admin, manager, non-teacher-student targets (D2); statics checked before the DB |
| Tampering: status bypass of the invited state | D5 on the locked row (hash-based, covers every path) |
| Tampering: partial update (rename applied but revoke/invite lost) | one transaction (D3); activity and revocation moved onto `tx` |
| Tampering: TOCTOU on ownership | lock + in-tx check; sub-second reassignment window accepted (Known-Gap residual 2, backlog stub) |
| Spoofing/DoS: mail bombing through the re-invite path | admin-only; per-IP route limit; one mail per effective email change; per-actor limit is the next follow-up and counts the `user.invite_resent` row this plan writes |
| Information disclosure: addresses in logs or the activity feed | `emailChangeSummary` never contains an address; no body/link logging; grep gate |
| Repudiation | activity rows with the actor for rename, status, email change, invite re-send |
| Session handling | refresh tokens revoked in-transaction on admin email change (active) and on pause; access JWT up to 15 min accepted (Known-Gap residual 1) |
| Self path regression (a user escalating through the rewrite) | self rules kept verbatim (D1/D9) and pinned by unit tests and the existing smoke `profile` domain |

---

## Risk Predictions (vc-predict equivalent, 5-persona pre-implementation debate)

| Persona | Prediction | Handled by |
|---|---|---|
| Security engineer | The rewrite widens the PATCH surface to managers; a missed branch lets a manager reach email, archive or an archived restore | D1 pure matrix with a unit truth table; D4; smoke 3-5 assert 403 and "no partial write"; code review of the access order |
| Backend engineer | Moving revocation/activity into the transaction changes failure semantics (an activity insert failure now rolls the edit back); unique violation mid-transaction aborts the tx | D3 documents it; D6 maps 23505 inside the tx callback exactly like `POST /users` (users.ts:331-358); smoke race test |
| Test engineer | The unchanged-email PATCH (the frontend always sends email) would sign people out or spam invites if the change were detected by key presence | D6 effective-change compare; smoke 7 asserts the unchanged-email case does neither |
| Frontend engineer | Manager edit still fails if the user PATCH keeps sending `email`; partial failure between two PATCHes confuses the user | D13 body shaping + partial-failure message + refresh in `finally`; vitest `people-api-edit.test.ts`; e2e |
| Release engineer | `users.ts`, `lib/invites.ts`, `smoke.ts` are touched again by the per-sender-limit follow-up and Phase 06 | Registry addendum: sequential order, this fix first; no new files shared with Phase 06 except `smoke.ts` and `frontend/e2e/demo/regression.spec.ts` |

Highest-risk checklist items (vc-scenario equivalent) and their edge cases are folded into B1 (manager sends `{name, email}` -> 403 and name NOT applied; manager `{name, role:"admin"}` -> role stripped, name applied, role unchanged; archived target; unknown id equals foreign id; self-manager editing their own record takes the self path; admin unchanged-email; invited + archived-never-activated email change does not re-invite), C (race, cooldown bypass, failNext) and D (partial failure).

---

## Blast Radius (verified 26-11-26)

**New (backend):** `backend/src/lib/user-edit-policy.ts`, `backend/tests/user-edit-policy.test.ts`.
**Modified (backend):** `backend/src/routes/users.ts` (PATCH handler and imports only), `backend/src/lib/activity.ts` (one union member), `backend/tests/contract.test.ts` (one anonymous `PATCH /users/:id` -> 401 assertion if not already present), `backend/scripts/smoke.ts` (new `teamEdits` domain + cleanup stays by email prefix).
**New (frontend):** `frontend/tests/people-edit-rules.test.ts`, `frontend/tests/people-api-edit.test.ts`, `frontend/e2e/api/manager-team-edits.spec.ts`.
**Modified (frontend):** `frontend/app/lib/school/api/school.ts`, `frontend/app/lib/school/services/people.ts`, `frontend/app/components/manager/{PeopleForms,ManagerTeachers,ManagerStudents}.tsx`, `frontend/app/components/admin/AdminManagers.tsx`, `frontend/tests/permissions.test.ts` (teacher.manage / student.manage matrix), `frontend/e2e/demo/regression.spec.ts` (one added demo test).
**Context docs updated at UPDATE PROCESS (not in EXECUTE):** `process/context/auth/{all-auth,roles-and-scope,jwt-cookie-flow}.md` (the known-gap sentence in roles-and-scope "Account creation" is rewritten; email-change session rules added), `process/context/uxui/school-data-layer.md`, `process/context/tests/all-tests.md` (counts, new spec/domain/test files), `process/context/all-context.md` (care-area line), `process/features/people-billing/_GUIDE.md` if it lists the manager gap; backlog: `manager-edit-team-member-403_NOTE_25-11-26.md` resolved and moved with the report, `account-invites-review-residuals_NOTE_25-11-26.md` item 9 annotated, `access-token-revocation_NOTE_24-11-26.md` annotated (email change and manager pause join the 15-minute window), `per-sender-invite-limit_NOTE_25-11-26.md` annotated (count the PATCH-issued `user.invite_resent` rows); new stubs: `manager-list-visibility-mismatch_NOTE_26-11-26.md`, `user-edit-two-call-atomicity_NOTE_26-11-26.md` (frontend user PATCH + profile PATCH are two calls), `manager-ownership-reassign-race_NOTE_26-11-26.md`.

**NOT touched:** `backend/src/db/*` (no schema, no migration), `backend/src/lib/{invites,scope,mailer,password,refresh-tokens}.ts`, `backend/src/routes/{teachers,students,auth,school,...}.ts`, `frontend/app/lib/school/{permissions,store,seed,notifications}.ts`, `frontend/app/globals.css`, `frontend/playwright*.config.ts`, `frontend/e2e/support/*`, `package.json` / `package-lock.json`, `README.md`, env files.

**Overlap (recorded in the registry addendum "Pre-06 manager-team-edits"):** `backend/src/routes/users.ts`, `backend/scripts/smoke.ts`, `frontend/e2e/demo/regression.spec.ts`, `frontend/app/lib/school/services/people.ts` are all touched by account-invites (DONE) and, next, by the `per-sender-invite-limit` follow-up (`users.ts`, `lib/invites.ts`, `smoke.ts`): strictly sequential, this fix first; Phase 06 only runs `smoke.ts` and the e2e suite. No shared edit regions with Phase 06's Docker/CI files.

**Risk class:** auth/identity, public API contract (authorization matrix of an existing route), session handling. Minimum tier Hybrid for each; high-risk evidence pack required. No schema/migration, no secrets surface change.

---

## Implementation Checklist

Per-step gates run at the end of each step. TDD: every Fully-Automated scenario is written as a failing test first (stubs in the Test Plan). Backend steps A-C run `npm run typecheck`, `npm run lint`, backend vitest; Step B and C also run the EXISTING `npm run smoke` (17 domains must stay green before new checks are added); Step D runs frontend vitest; Step E runs everything.

### Step A — Pure policy and activity action (backend, red first)

- [ ] A1. Write `backend/tests/user-edit-policy.test.ts` FIRST (failing): the access truth table (D1), the effects table (D6-D10) including the row admin + invited + `{email, status:"archived"}` -> `expireInvites`, no `reinvite`, the summaries (D7/D8/D11, never an address). Run it red.
- [ ] A2. Create `backend/src/lib/user-edit-policy.ts` with `userPatchAccess`, `planUserPatchEffects`, `emailChangeSummary` (pure, no imports from db). Green.
- [ ] A3. `backend/src/lib/activity.ts`: add `"user.email_changed"` to `ActivityAction` (kept alphabetical next to `user.created`).
- [ ] A4. Gate: `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/backend`.

### Step B — Transactional PATCH /users/:id (backend)

- [ ] B1. Follow D19 exactly (locked before-row, static deny before DB, empty-body 400 before tx, bare `forbidden()` for manager missing/foreign, statement order, UNIQUE catch with no further tx statements, archived+invited email change = expire only). In the SAME step update the ONE existing smoke assertion `backend/scripts/smoke.ts:1617` (`invites` domain, inv15): `openInviteCount === 0` becomes `openInviteCount === 1` with label "an email change expires the old invite and issues one new invite", and next to it assert the old token is still `400` (line 1616 already does) and `outboxFor(emailFor("inv15b")).length === 1`; this is the ONLY allowed edit to an existing smoke assertion, the `profile` domain is untouched. Rewrite the PATCH handler in `backend/src/routes/users.ts` (lines 421-547) exactly per "Route behavior": access policy first, one transaction, `lockUserForInvite`, ownership via `managerOwnsInTx`, D4/D5 checks, duplicate pre-check, wrapped update with `isUniqueViolation` -> 409, effects, activity on `tx`, mail after commit via `deliverInvite`. Remove now-unused imports only after grepping the file (`managerOwnsStudent`/`managerOwnsTeacher` at 40-41; `managerTeam` stays).
- [ ] B2. Extend `backend/tests/contract.test.ts` only if the anonymous `PATCH /api/v1/users/:id` -> 401 assertion is missing (EXECUTE greps first).
- [ ] B3. Gate (B3 smoke must be green INCLUDING the updated 1617 assertion BEFORE C1 adds the new domain): typecheck, lint, vitest, `npm run smoke` (the existing 17 domains incl. `profile` and `invites` stay green; the `profile` domain's self-rename and cross-403 checks, smoke.ts:925-937, are the direct regression guard for the access rewrite).

### Step C — Smoke `teamEdits` domain (backend, hybrid)

- [ ] C1. `backend/scripts/smoke.ts`: add `async function teamEditsScenario()` and `await scenario("team-edits", teamEditsScenario);` after the `invites` scenario call (smoke.ts:1999). Self-contained fixtures with unique `smoke-{runId}-te*` emails created through the existing `createUser` helper and `adminInvite` helper (smoke.ts:252, 1409-1414); no change to existing helpers; `cleanup()` already archives every `smoke-{runId}-%` user (best effort). Cases are listed in the Smoke matrix below; each legitimate cooldown-sensitive resend waits `RESEND_WAIT_MS` (2.1 s). Helper rules (PVL cycle 1): every changed-to email uses `emailFor("te-...")` so prefix cleanup works; the enrolled-only student is `teStudentB` (on managerB's roster) enrolled with teacherA by admin `POST /enrollments` using `bookingScenario`'s published `courseId`, then managerA rename -> 200 (the frontend roster-only asymmetry is expected and documented); activity summaries are read through a local db query helper filtered by `targetType='user'` and `targetId` (no shared helper change); unknown-key cases sent by a manager on an own-team target (PVL cycle 2, resolved): zod strips unknown keys, so `{managerId}` alone and `{role:"admin"}` alone are EMPTY after parsing -> `400 "No fields to update"` (NOT 403; the static policy passes an empty key set and the empty-body check answers, before any DB read, so there is no oracle at foreign/unknown ids either); `{name, role:"admin"}` -> 200, name applied, role unchanged; `{name, managerId}` -> 200, name only (see the Validate Contract, instruction E2).
- [ ] C2. Gate: typecheck, lint, vitest, `npm run smoke` (18 domains).

### Step D — Frontend

- [ ] D1. `frontend/app/lib/school/api/school.ts`: `updateUser` body shaping + `{ invite? }` return; `updateTeacher` / `updateStudent` partial-failure rethrow (D13). Write `frontend/tests/people-api-edit.test.ts` FIRST (red), then make it green. Mocking rules: hoisted `vi.mock("@/app/lib/api/client")` keeping the real `ApiError` via `importActual`, and `vi.mock("@/app/lib/auth/session")` for `getSessionSnapshot`; `vi.stubEnv("NEXT_PUBLIC_DEMO_MODE","false")` and `vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE","api")` with `vi.unstubAllEnvs()` in `afterEach`; the shared builder lives in `frontend/tests/helpers/api-mock.ts` (new file, added to Touchpoints).
- [ ] D2. `frontend/app/lib/school/services/people.ts`: `updateTeacher` / `updateStudent` / `updateManager` return `{ invite? }`, API branches use `cleanName`, `finally`-refresh, local manager-email rule (D15). Write `frontend/tests/people-edit-rules.test.ts` FIRST (red), then green.
- [ ] D3. `PeopleForms.tsx` (`lockEmail`/`emailNote`), `ManagerTeachers.tsx`, `ManagerStudents.tsx`, `AdminManagers.tsx` (lock for non-admin, invited note, open `InviteResultModal` after an edit that returns `invite`).
- [ ] D4. Extend `frontend/tests/permissions.test.ts` with the `teacher.manage` / `student.manage` matrix (admin yes; own-team manager yes; other manager no; teacher/student no; the roster-only asymmetry case) (D17).
- [ ] D5. Gate: `npm run typecheck`, `npm run lint`, `npm run test --workspace @lumina/frontend`, `npm run test --workspace @lumina/backend` (the contract test imports frontend types).

### Step E — E2E, exit gates, evidence

- [ ] E1. `frontend/e2e/api/manager-team-edits.spec.ts` per the e2e matrix. Selectors: `getByLabel('Email')` for the disabled input, `getByPlaceholder(/Business English/)` for the headline (EXECUTE verifies the placeholder text first), `getByRole('button',{name:'Edit'|'Pause'|'Reactivate'})` plus the confirm button; the only new test id is `email-locked-note`. Test 1/2 fixtures are created WITH a password (active); Test 3 WITHOUT (invited). Fixtures via `apiPost('/users', adminToken, {..., managerId})`; confirm the disposable teacher has a profile row (else the profile PATCH 404s); do the port check first. Fixtures created through `apiPost('/users', adminToken, {...})` directly (with `managerId` of `manager@lumina.school` read via `bootstrap` + `userByEmail`), NOT by changing `createDisposableUser`; unique `runId`; `archiveUser` in `finally`.
- [ ] E2. `frontend/e2e/demo/regression.spec.ts`: one new demo test (manager edit form: Email disabled, name edit works, zero `/api/v1/` calls).
- [ ] E3. Port check (Hard Stop 4) then run every exit gate and the regression list; run the logging grep gate; write the high-risk evidence pack.
- [ ] E4. Agent-probe (T5): a throwaway Playwright script in the scratchpad (not committed) against the API-mode servers, or `testInfo.attach` in the spec; viewports 1440x950 and 390x844; images saved under the task folder `harness/`. Screenshots of the manager edit form (disabled email) and the invite-result modal after an admin edit, at desktop and 390 px (AC-16).

---

## Acceptance Criteria (REQ-TEST-LINK; each names its proving gate and strategy)

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | A manager renames an own-team teacher and student (roster; and an enrolled-with-team-teacher student per backend `managerOwnsStudent`) with `200`, the name changes, exactly one `user.renamed` row, visible in the manager's bootstrap | smoke `team-edits` rename checks | Hybrid |
| AC-2 | A manager targeting an unknown id, another team's user, an admin, another manager, or a non-teacher/student gets the identical `403` (same body); self-edit by a manager keeps working | vitest `user-edit-policy.test.ts` (static parts) + smoke `team-edits` scope checks + existing `profile` domain | Fully-Automated + Hybrid |
| AC-3 | Manager `email`, `avatarColor`, `status:"archived"`, or `{name, email}` together all `403` with NOTHING applied; an archived team member cannot be renamed or restored by a manager; unknown keys such as `role` are ignored (role unchanged) | vitest `user-edit-policy.test.ts` + smoke `team-edits` restricted-field checks | Fully-Automated + Hybrid |
| AC-4 | A manager pauses and reactivates an own-team teacher and student (`200`); pause revokes the member's refresh tokens (old refresh cookie fails, login fails); reactivation lets them sign in; a manager of another team gets `403`; an invited member answers `409 ACCOUNT_NOT_ACTIVATED`; activity `user.paused` / `user.active` once each | smoke `team-edits` pause/reactivate checks | Hybrid |
| AC-5 | Admin changes an ACTIVE person's email: refresh tokens revoked in the same transaction, old refresh cookie and old-address login fail, new-address login works, one `user.email_changed` row without any address in its summary; an unchanged email revokes nothing and writes no row; a self email change keeps the person signed in | vitest `user-edit-policy.test.ts` (effects, summaries) + smoke `team-edits` email checks | Fully-Automated + Hybrid |
| AC-6 | Admin changes an INVITED person's email: the old link dies, exactly one open invite remains, exactly one mail goes to the NEW address and none to the old, the response carries `invite` (with `link` for the admin in array mode), the cooldown is bypassed for an immediate second change, `failNext` leaves the edit and token committed with `sent:false` and the generic error, the new link then sets a password and logs in at the new address; one `user.email_changed` and one `user.invite_resent` row | smoke `team-edits` invited-email checks + vitest effects table | Hybrid + Fully-Automated |
| AC-7 | Duplicate email is `409` with nothing changed (tokens and invites intact); a `Promise.all` race for the same new address gives one `200` and one `409`, never `500`, and the loser's user and invite are unchanged | smoke `team-edits` duplicate/race checks | Hybrid |
| AC-8 | Pure policy: access matrix (all actor/target/key/status combinations in D1), effects table (D6-D10: effective-change compare, revoke/expire/reinvite flags, self and archived and paused cases), summaries never contain an address | vitest `backend/tests/user-edit-policy.test.ts` | Fully-Automated |
| AC-9 | Activity: no summary written by this route contains an `@` address; rows are written on the transaction (a rolled-back edit leaves none) | smoke `team-edits` activity checks (summaries scanned for `@`; the rolled-back duplicate attempt leaves zero new rows) + vitest summaries | Hybrid + Fully-Automated |
| AC-10 | Frontend request shaping: a manager session sends exactly `PATCH /users/:id {name}` (no `email` key) then the profile PATCH; an admin sends the trimmed lowercased email; a profile-PATCH failure after the user PATCH succeeds surfaces the "saved the name and email, not the profile" message with the original status/code; `updateUser` returns the `invite` outcome | vitest `frontend/tests/people-api-edit.test.ts` (mocked API client + session) | Fully-Automated |
| AC-11 | Frontend local/demo parity and permissions: a manager changing an email in the local branch is refused, name and profile edits and pause/reactivate on the own team succeed, other-team targets are refused, admin may change email; `teacher.manage`/`student.manage` matrix including the roster-only asymmetry | vitest `frontend/tests/people-edit-rules.test.ts` + `frontend/tests/permissions.test.ts` | Fully-Automated |
| AC-12 | UI end to end (API mode): a manager edits a team teacher's name and headline (both PATCH calls `200`, store shows the new name) and pauses/reactivates a team student; the Email input is disabled for the manager; an admin editing an invited teacher's email sees the invite result and the old link is dead | `frontend/e2e/api/manager-team-edits.spec.ts` | Hybrid |
| AC-13 | Demo fence: in demo mode the manager edit form shows Email disabled, a name edit works, zero `/api/v1/` calls | `frontend/e2e/demo/regression.spec.ts` | Hybrid |
| AC-14 | No regression: `profile`, `invites`, `auth` smoke domains, backend `auth-lifecycle`/`invites`/`contract` vitest, e2e `account-invites.spec.ts`/`auth.spec.ts`/`uploads.spec.ts`/`curriculum-library.spec.ts`, frontend vitest suite | regression list in Exit Gate | Hybrid |
| AC-15 | Static soundness and no schema change: `typecheck`, `lint`, `git diff --check`, `git status --porcelain -- backend/src/db` empty, no new log matches, no new dependency | Exit Gate static commands | Fully-Automated |
| AC-17 | Authorization edge matrix (PVL cycle 1): manager `{email}` or `{avatarColor}` on ANY id -> 403 with no DB write; manager unknown-id vs foreign-id responses are byte-identical 403 bodies; manager on an archived OWN-team member -> 403; invited own-team rename 200 and pause 409; admin with an unchanged email -> no revoke, no invite, no `user.email_changed` row; no activity summary (`email_changed`, `invite_resent`) contains `@`; admin + invited + `{email, status:"archived"}` -> invites expired, no new mail | vitest `user-edit-policy.test.ts` + smoke `team-edits` | Fully-Automated + Hybrid |
| AC-16 | The edited screens are usable at desktop and 390 px: manager edit form with the disabled Email and note, the invite-result modal after an admin edit | agent-probe screenshots (API mode, log mailer) | Agent-Probe |

Known-Gap residuals (never proving strategies; recorded with backlog stubs; no developed behavior is PASS-able on these alone):
1. Access JWT lives up to 15 minutes after a pause or an admin email change (existing `access-token-revocation` note; the refresh revocation itself is proven by AC-4/AC-5).
2. The user-row lock serializes user-row writers only; profile/enrollment reassignment is NOT locked, so a reassignment that commits after the in-transaction ownership read is not blocked (accepted; backlog stub `manager-ownership-reassign-race_NOTE_26-11-26.md`); the locked ownership check itself is proven by AC-2.
3. A manager may reactivate a member that an admin paused (U2); accepted, unchanged by this plan.
4. Admin invited-email change uses cooldown 0 (D8): the one new mail vector, bounded by admin-only access and the IP rate limit until `per-sender-invite-limit`; compromised-admin mail volume accepted.

---

## Test Plan (vc-test-coverage-plan; chain loaded: `process/context/tests/all-tests.md` is the whole test guide, no deeper test docs exist; existing blast-radius tests discovered: `backend/tests/{app,contract,auth-lifecycle,invites,mailer,db-types}.test.ts`, `backend/scripts/smoke.ts` domains `profile` (925-937), `invites` (1416-) and `auth` (1203-), `frontend/tests/{permissions,invite-hash}.test.ts` + `frontend/tests/helpers/{school,fixtures}.ts`, `frontend/e2e/api/{account-invites,auth}.spec.ts`, `frontend/e2e/demo/regression.spec.ts`)

Targets (minimums, exact totals recorded by EVL): backend vitest >= 13 files / >= 110 tests (now 12/98); frontend vitest >= 13 files / >= 75 tests (now 11/62); smoke >= 18 domains / >= 910 checks (now 17/835); e2e >= 33 API + 6 demo (now 30/5). Runners: vitest (backend, frontend), the in-process smoke script, Playwright.

### Fully-Automated stubs (red first; each written failing before the code exists)

```
Failing stub: test("should deny a manager any email or avatarColor key and any archive status", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess manager restrictions") })
Failing stub: test("should allow a manager only name and active/paused status on a non-self target", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess manager-team") })
Failing stub: test("should keep self rules: self may change name, email, avatarColor, never status unless admin", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess self") })
Failing stub: test("should deny teacher and student on a non-self target before any database read", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess teacher/student") })
Failing stub: test("should treat an unchanged email as no change: no revoke, no reinvite", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: planUserPatchEffects effective change") })
Failing stub: test("should revoke sessions only when an admin changes another active person's email", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: planUserPatchEffects revokeSessions") })
Failing stub: test("should reinvite only when an admin changes an invited person's email", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: planUserPatchEffects reinvite") })
Failing stub: test("should never put an email address in an activity summary", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: emailChangeSummary") })
Failing stub: test("should send only the name for a manager session and trimmed lowercase email for an admin", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: updateUser body shaping") })
Failing stub: test("should report which part was saved when the profile PATCH fails after the user PATCH", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: updateTeacher partial failure") })
Failing stub: test("should refuse a manager email change in the local branch and allow a name edit", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: local manager email rule") })
```

### Backend vitest file coverage

| File | Cases |
|---|---|
| `user-edit-policy.test.ts` (new) | `userPatchAccess`: admin any key set; manager `{name}` ok, `{status:"paused"|"active"}` ok, `{name,status:"paused"}` ok, `{email}` / `{avatarColor}` / `{name,email}` deny, `{status:"archived"}` deny; self non-admin with `status` deny, self name/email/avatar ok; teacher/student non-self deny; admin self ok. `planUserPatchEffects`: unchanged email (same value) -> all flags false; admin + other + active + changed email -> `revokeSessions`; admin + other + invited -> `reinvite` + `expireInvites`, no revoke; admin + paused -> neither; admin + archived never-activated -> neither; self email -> neither; status change from active -> revoke (D10); `paused`/`archived` -> expireInvites; name-only -> only `nameChanged`. `emailChangeSummary`: three fixed strings, none contains `@`, name preserved. |
| `contract.test.ts` (extend if needed) | anonymous `PATCH /api/v1/users/:id` -> 401; collection keys still 18 |
| existing `invites.test.ts`, `auth-lifecycle.test.ts`, `mailer.test.ts` | unchanged, must stay green |

### Smoke `team-edits` domain matrix (`backend/scripts/smoke.ts`; unique `smoke-{runId}-te*` fixtures: teacher `teTeacher` and student `teStudent` on managerA, `teOtherT`/`teOtherS` on managerB, plus invited and extra fixtures; array mailer injected; cooldown 2 s)

1. Rename: managerA `PATCH /users/:teTeacher {name}` -> 200, response name changed, exactly one `user.renamed` activity row, managerA bootstrap contains the new name; same for `teStudent` (roster). Enrolled-only student: reuse the enrollment fixture from setup if one links a managerB-roster student to a managerA teacher (EXECUTE verifies; otherwise create one via `POST /enrollments` as admin with the published course used by `bookingScenario`) -> managerA rename 200 (documents backend-broader-than-frontend). Unchanged name -> 200, no new activity row.
2. Scope: managerA on `teOtherT`, `teOtherS`, managerB (user), admin, a random uuid -> all 403 with the SAME error body for the unknown uuid and the foreign user (compare code + message); managerA renames self -> 200 (self path regression); teacher renames student and student renames teacher -> 403 (existing).
3. Restricted fields: managerA `{email}` -> 403; `{avatarColor}` -> 403; `{name, email}` -> 403 and the name is NOT applied (re-read via bootstrap); `{status:"archived"}` -> 403 and status unchanged; `{name, role:"admin"}` -> 200, name applied, role still `teacher` (unknown key stripped); `{}` -> 400.
4. Pause/reactivate: sign in `teTeacher` (cookie), managerA pauses -> 200, `activeTokenCount(teTeacher) === 0`, refresh with the old cookie -> 401, login -> 401; one `user.paused` row; managerB pause attempt on it -> 403 status unchanged; managerA reactivates -> 200, login -> 200, one `user.active` row; same for `teStudent`. Archived: admin `DELETE`s a spare team student, managerA `{status:"active"}` -> 403 and status stays `archived`, managerA rename -> 403. Invited: admin-invited team teacher (managerId managerA): managerA rename -> 200, managerA `{status:"paused"}` and `{status:"active"}` -> 409 `ACCOUNT_NOT_ACTIVATED`.
5. Admin email on ACTIVE: sign in the target twice (two cookies); admin changes email to a fresh address -> 200; `activeTokenCount === 0`; refresh with each old cookie -> 401; login at the old address -> 401, at the new -> 200; exactly one `user.email_changed` row whose summary contains no `@`; admin PATCH with the SAME email plus a new name -> 200, tokens still active (sign in first), no new `user.email_changed` row; the user changes their OWN email (self path) -> 200, their tokens remain active, one `user.email_changed` row without revocation; admin changes a PAUSED user's email -> 200, no invite mail, no new outbox entry.
6. Admin email on INVITED: admin invites a teacher (outbox 1 to old address); admin changes the email -> 200, response `invite.sent:true`, `invite.mode:"array"`, `invite.link` present (admin), outbox: exactly 1 new message to the NEW address and still 1 to the old; the old token -> 400 `INVALID_OR_EXPIRED_TOKEN`; `openInviteCount === 1`; the new token -> set-password 204 -> login at the new address 200; one `user.email_changed` and one extra `user.invite_resent` row. Cooldown bypass: change the email twice back to back (no wait) -> both 200, two mails to the two new addresses, one open token. `mailer.failNext(...)`: the PATCH still 200 with `invite.sent:false`, the generic error text (no SMTP wording), the user has the new email, one open token, and a following admin Resend after `RESEND_WAIT_MS` succeeds. A manager changing an invited member's email -> 403 (no invite sent). Archived never-activated user email change -> 200, no mail.
7. Duplicate/race: admin sets user X's email to user Y's existing email -> 409 and X unchanged (active X keeps its refresh tokens; invited X keeps its original working token and open invite count); `Promise.all` of two admin PATCHes giving two different users the same fresh email -> exactly one 200 and one 409 (never 500), the loser's email unchanged and (for invited users) the loser's old invite still valid; a rolled-back attempt leaves zero new activity rows.
8. Activity hygiene: list `/activity` rows for the targets created in this domain and assert no summary contains `@`.
9. Regression-sensitive: existing `profile` domain unchanged and green; admin rename/avatar/pause of another user unchanged; manager profile `PATCH /teachers/:id` and `/students/:id` own team 200 / other team 403 still hold.

### E2E matrix (`frontend/e2e/api/manager-team-edits.spec.ts`; backend runs with the `log` mailer and cooldown 0; hygiene: unique `runId` emails/names, `archiveUser` in `finally`; fixtures via `apiPost('/users', adminToken, ...)` with `managerId` of `manager@lumina.school`)

- Test 1 (manager edits and pauses a team teacher): the manager signs in, Teachers, opens the disposable team teacher, Edit; the Email input is disabled and `email-locked-note` is visible; changes the name and the headline, submits; `PATCH /users/:id` and `PATCH /teachers/:id` both `200` (request body of the first has no `email` key); the row shows the new name; Pause -> confirm -> status paused via API (`bootstrap` as admin); Reactivate -> active; no page errors.
- Test 2 (manager edits and pauses a team student): same for Students (Edit name + goal; Pause/Reactivate); a student of ANOTHER team is not listed for the manager (no access path from the UI).
- Test 3 (admin changes an invited teacher's email): admin creates an invited teacher via API, opens Edit, sees the invited note, changes the email, submits; the invite result modal opens (`invite-result`, `invite-link` visible for the admin in log mode); the OLD link (read from a prior create response) now shows the invalid/expired message in a new context; clean-up archives the user.
- Demo regression (`regression.spec.ts`, +1 test): demo manager opens Edit on a team person, Email is disabled with the note, a name edit succeeds and appears, `apiCalls` equals `[]`.

### Regression list (EVL reruns)

Backend vitest `auth-lifecycle`, `invites`, `mailer`, `contract`, `db-types`; smoke `profile`, `invites`, `auth`, `uploads`, `library`, `rebook`; e2e `account-invites.spec.ts`, `auth.spec.ts`, `uploads.spec.ts`, `curriculum-library.spec.ts`; the whole frontend vitest suite (`permissions`, `invite-hash`, `credits`, ...). All existing 835 smoke checks stay green except `smoke.ts:1617`, updated per D8 (B1) and still one check. Run order: B3 smoke green after that edit before C1 adds the new domain.

### Gap resolution (vc-test-coverage-plan format)

| Gap | Resolution options |
|---|---|
| Frontend component rendering of the disabled-email form and the note | A) e2e covers behavior (chosen, AC-12/AC-13). B) component test runner (none exists). C) accept. D) existing backlog theme "no frontend component tests". |
| Transaction rollback proof needs a database | A) smoke duplicate/race + zero-new-activity check (chosen). B) disposable test DB (Phase 06). C) accept. D) existing `smoke-ci-and-fixtures` backlog. |
| Access-token window after pause/email change | A) none feasible without a token-version design. B) `access-token-revocation` redesign. C) accept (chosen, Known-Gap residual 1, note annotated). D) existing backlog note. |
| Ownership reassign race | A) lock the profile row `FOR SHARE` (not chosen: enrollment-derived ownership cannot be locked simply). B) accept (chosen, Known-Gap residual 2). C) none. D) `manager-ownership-reassign-race_NOTE_26-11-26.md`. |

---

## Exit Gate

```powershell
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run test --workspace @lumina/frontend
npm run smoke                              # array mailer only; 18 domains
# pre-e2e port check (literal, Hard Stop 4): `netstat -ano | findstr ":3000 :3100 :4000"` must print nothing (listening); else STOP and ask
npm run e2e                                # log mailer only
git diff --check
git status --porcelain -- backend/src/db   # must print nothing (no schema change, D18)
git diff --stat -- package.json package-lock.json backend/package.json frontend/package.json   # must print nothing (no dependency change)
# logging gate: no NEW matches (files: backend/src/routes/users.ts, backend/src/lib/user-edit-policy.ts)
git grep -nE "(log|logger)\.(info|warn|error|debug)\([^)]*(token|link|html|text|MAIL_PASSWORD|email)" -- backend/src/lib/user-edit-policy.ts backend/src/routes/users.ts   # expect no new output vs `git show HEAD:backend/src/routes/users.ts`
# Expected counts are MINIMUMS (>= current): backend vitest >= 13 files / >= 110 tests; frontend vitest >= 13 / >= 75; smoke >= 18 domains / >= 910 checks; e2e >= 33 API + 6 demo; EVL records the exact counts.
```

- All checklist items A-E checked; no real mail sent at any point.
- Phase 03 auth, account-invites, Phase 02/04/05 regression confirmed green; high-risk evidence pack written in `harness/manager-team-edits/`.
- Report written to the report destination above.

---

## Blockers That Would Justify BLOCKED Status

- The existing 17 smoke domains cannot stay green after Step B (for example the `profile` self-rename or cross-403 checks regress).
- A requirement turns out to need a schema change, a new route or a manager right beyond U1/U2 (Hard Stop 5).
- A port 4000 listener exists before `npm run e2e` (Hard Stop 4) and the user has not cleared it.
- Any step would require reading `backend/.env`, printing a secret, or sending real mail.

---

## Rollback

Code only: revert the uncommitted execution changes (everything lands in one execution commit on `developing`). No migration, no data change: users edited or paused during verification stay as the suites leave them (smoke/e2e fixtures are archived by their own cleanup). Reverting restores the admin-or-self PATCH and the old non-transactional behavior; managers return to `403` on member edits. Nothing outside the files in Blast Radius changes, and the new `user.email_changed` activity rows already written are plain history rows that older code simply renders with the fallback title.

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step loop is `R -> I -> P -> PVL -> E -> EVL -> UP`; the outer SPEC step was skipped by user decision for this fix.

- [x] 0. SPEC — skipped by user decision (26-11-26): the six user decisions U1-U6 listed above are the locked requirements
- [x] 1. RESEARCH — 26-11-26: research-agent verified `users.ts` PATCH (421-547), the frontend two-call edit flow, profile routes, scope helpers, demo branch and test coverage gaps
- [x] 2. INNOVATE — compressed (user decisions 26-11-26): approach chosen by the user (U1-U6); the design in Locked Decisions D1-D18 is the Decision Summary; deviations are marked DEVIATION (D4)
- [x] 3. PLAN — 26-11-26: this plan written; registry addendum "Pre-06 manager-team-edits" added
- [x] 4. PVL — cycle 1 supplement applied 26-11-26 (see "PVL cycle 1 supplement"); re-validated from V1 26-11-26: Gate: PASS (validate-contract written)
- [ ] 5. EXECUTE — not started
- [ ] 6. EVL — not started
- [ ] 7. UPDATE PROCESS — not started

**Validate-contract required before execute.** If step 4 is unchecked or `## Validate Contract` reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", the orchestrator must spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent instructions / Test gates is treated as a placeholder.

---

## Touchpoints

- `backend/src/lib/{user-edit-policy,activity}.ts`
- `backend/src/routes/users.ts`
- `backend/tests/{user-edit-policy,contract}.test.ts`, `backend/scripts/smoke.ts`
- `frontend/app/lib/school/api/school.ts`, `frontend/app/lib/school/services/people.ts`
- `frontend/app/components/manager/{PeopleForms,ManagerTeachers,ManagerStudents}.tsx`, `frontend/app/components/admin/AdminManagers.tsx`
- `frontend/tests/{people-edit-rules,people-api-edit,permissions}.test.ts`, `frontend/tests/helpers/api-mock.ts` (new)
- `frontend/e2e/api/manager-team-edits.spec.ts`, `frontend/e2e/demo/regression.spec.ts`
- Read only: `backend/src/lib/{invites,scope,refresh-tokens,errors,password}.ts`, `backend/src/routes/{teachers,students}.ts`, `frontend/app/lib/school/permissions.ts`, `frontend/e2e/support/*`

---

## Public Contracts

- Changed endpoint: `PATCH /api/v1/users/:id` (guard unchanged: authenticated). Access: admin all fields; self name/email/avatarColor (never status unless admin); manager only on own-team teachers/students, body keys `name` and `status` in `active|paused`, never an archived target; every other actor/target/key combination `403` (identical body for unknown and foreign targets for managers). Responses: `200` public user; plus `invite: { sent, mode, error?, link? }` only when an admin's email change on an INVITED person issued a new invite (`link` per the existing admin-only exposure rule); `400`, `403`, `404` (admin only, unknown id), `409 CONFLICT` (duplicate email, now including the concurrent race), `409 ACCOUNT_NOT_ACTIVATED`. Body schema unchanged (`name`, `email`, `avatarColor`, `status`; unknown keys still ignored).
- Behavior contract: admin email change on an ACTIVE person revokes that person's refresh tokens; on an INVITED person it expires old invites and mails a new one; an unchanged email is a no-op; the edit is atomic.
- Activity: new action `user.email_changed` (summary never contains an address); `user.invite_resent` is also written when the invite is issued by an email change.
- Unchanged: `POST /users`, `POST /users/:id/invite`, `/teachers/:id`, `/students/:id`, bootstrap keys (18) and `SCHOOL_SCHEMA_VERSION` 3, env contract, DB schema and migrations, frontend `permissions.ts` actions.
- Frontend service contracts: `updateTeacher` / `updateStudent` / `updateManager` return `ServiceResult<{ invite?: InviteOutcome }>` (callers adapted); `PeopleForms` modals gain optional `lockEmail` / `emailNote`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| smoke `team-edits` rename checks (own-team teacher/student, enrolled-only student, unchanged name) | Hybrid | AC-1 |
| vitest `user-edit-policy.test.ts` (static access) + smoke `team-edits` scope checks + existing `profile` domain | Fully-Automated + Hybrid | AC-2 |
| vitest `user-edit-policy.test.ts` + smoke `team-edits` restricted-field checks (no partial write, archived target, unknown keys) | Fully-Automated + Hybrid | AC-3 |
| smoke `team-edits` pause/reactivate + refresh revocation + invited 409 | Hybrid | AC-4 |
| vitest effects/summaries + smoke `team-edits` admin email on ACTIVE (revoke, unchanged, self, paused) | Fully-Automated + Hybrid | AC-5 |
| smoke `team-edits` admin email on INVITED (new mail, old link dead, cooldown bypass, failNext, set-password at new address) + vitest effects | Hybrid + Fully-Automated | AC-6 |
| smoke `team-edits` duplicate email and `Promise.all` race | Hybrid | AC-7 |
| vitest `backend/tests/user-edit-policy.test.ts` | Fully-Automated | AC-8 |
| smoke `team-edits` activity hygiene + rolled-back attempt + vitest summaries | Hybrid + Fully-Automated | AC-9 |
| vitest `frontend/tests/people-api-edit.test.ts` | Fully-Automated | AC-10 |
| vitest `frontend/tests/people-edit-rules.test.ts` + `frontend/tests/permissions.test.ts` | Fully-Automated | AC-11 |
| `frontend/e2e/api/manager-team-edits.spec.ts` | Hybrid | AC-12 |
| `frontend/e2e/demo/regression.spec.ts` | Hybrid | AC-13 |
| Regression list (smoke profile/invites/auth/uploads/library/rebook, vitest auth-lifecycle/invites/mailer/contract/db-types, e2e account-invites/auth/uploads/curriculum-library, frontend vitest) | Hybrid | AC-14 |
| `typecheck`, `lint`, `git diff --check`, `git status --porcelain -- backend/src/db` empty, no dependency diff, logging grep | Fully-Automated | AC-15 |
| Screenshot review at desktop and 390 px (API mode, log mailer) | Agent-Probe | AC-16 |
| smoke `team-edits` authorization edge matrix + vitest policy rows (manager restricted keys, byte-identical 403, archived own-team, invited rename/pause, unchanged admin email, no `@` in summaries, archived+invited email change) | Fully-Automated + Hybrid | AC-17 |

High-risk classes present (auth/identity, public API contract, session handling): minimum Hybrid; every developed behavior has a Fully-Automated, Hybrid or Agent-Probe gate; the two Known-Gap residuals (access-token window, sub-second reassignment race) are recorded with backlog stubs and are never counted as PASS.

---

## Test Infra Improvement Notes

- `backend/scripts/smoke.ts` is a shared surface (account-invites, the per-sender-limit follow-up, Phase 06 CI); keep `teamEditsScenario` self-contained with its own fixtures. It adds more cooldown sleeps (2.1 s each); an injectable clock in `lib/invites.ts` (existing candidate `invite-clock-injection`) would remove them.
- There is no DB-backed vitest tier, so transaction rollback and the unique-violation race can only be proven in smoke; a disposable test database (Phase 06 compose) would let these run per commit.
- Frontend services are unit-tested only through their local branch; the API branch needs the mocked client approach introduced in `people-api-edit.test.ts` (mock `@/app/lib/api/client` `request` and `@/app/lib/auth/session`). If reused, factor a helper under `frontend/tests/helpers/`.
- No frontend component tests exist (disabled-email form and notes are proven only by e2e).
- Playwright's `reuseExistingServer` can silently reuse a developer backend (Hard Stop 4 guards it manually); Phase 06 should make this a hard check.
- Smoke has no helper that lists a user's activity summaries; EXECUTE adds a tiny local helper inside the domain (not a shared change).

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/completed/manager-team-edits_26-11-26/manager-team-edits_PLAN_26-11-26.md`
- Last completed step: Step 3 PLAN (26-11-26); Steps 0-2 recorded in Phase Loop Progress (SPEC skipped by user decision, INNOVATE compressed by user decisions U1-U6)
- Validate-contract status: written 26-11-26, Gate: PASS (generated-by: outer-pvl); next EXECUTE
- Supporting context files loaded: `process/context/{all-context,tests/all-tests,auth/{roles-and-scope,jwt-cookie-flow},uxui/school-data-layer}.md`; backlog notes `manager-edit-team-member-403`, `account-invites-review-residuals`, `per-sender-invite-limit`, `access-token-revocation`; the account-invites plan (format and rigor reference); `phase-blast-radius-registry.md`. Code anchors verified 26-11-26: `users.ts:25,37,40-43,64-89,91-96,98-167,173-207,376-419,421-547` (PATCH 421-547; the `!isSelf && !isAdmin` block at 428-430; team-member status branch 431-447 unreachable for managers; email duplicate pre-check 475-483 outside any catch; revoke/activity on `app.db` at 513/516/525/536), `lib/invites.ts:88-99,102-120,129-177,249-287`, `lib/scope.ts:104-132`, `lib/errors.ts:45-52`, `lib/refresh-tokens.ts` `revokeUserRefreshTokens(db: DbOrTx,...)`, `lib/activity.ts:13-60`, `teachers.ts:149-230`, `students.ts:177-260`, `schema.ts:95` (`users.email` unique), `smoke.ts:243-262,433-440,925-937,1156-1188,1195-1199,1370-1414,1983-1999`, `api/school.ts:51,72-96,113-124,140-143`, `people.ts:35-39,119-179,265-281,333-350,356-363,377-390`, `permissions.ts:66-71,96-104`, `PeopleForms.tsx:63,83,130,190-201`, `ManagerTeachers.tsx:72,85,100-104,154-160,203-215`, `ManagerStudents.tsx:101,129,178-186,225-229`, `AdminManagers.tsx:50,110,116`, `notifications.ts:136,248`, `account-invites.spec.ts` (fixture and selector style).
- Next step: spawn vc-validate-agent (sonnet; parallel Layer-1 dimension agents: security/authorization, test coverage and tiers, plan feasibility and code anchors) for PVL; after Gate: PASS the orchestrator emits the /goal block and spawns vc-execute-agent (opus, sequential) for Steps A-E; EVL by a spawned vc-tester (sonnet); no user-gated hard-stop step exists in this plan.

### Open Items for the user (not blockers for PLAN/PVL)

1. None blocking. The decision to bypass the 30 s resend cooldown on an admin's invited-email change (D8) and the "managers may not touch archived members at all" safety rule (D4) are plan-level choices recorded for PVL review; say so if either should be different.

### UPDATE PROCESS list (for vc-update-process-agent)

- Backlog: resolve `manager-edit-team-member-403_NOTE_25-11-26.md` (move with the report); annotate `account-invites-review-residuals_NOTE_25-11-26.md` item 9, `access-token-revocation_NOTE_24-11-26.md`, `per-sender-invite-limit_NOTE_25-11-26.md`; write stubs `manager-list-visibility-mismatch_NOTE_26-11-26.md`, `user-edit-two-call-atomicity_NOTE_26-11-26.md`, `manager-ownership-reassign-race_NOTE_26-11-26.md`.
- Context docs listed under Blast Radius; the `all-context.md` care-area wording; test counts from the EVL run.
- Registry: set this fix's status in `phase-blast-radius-registry.md`; keep the per-sender-limit sequential overlap note.

---

## PVL cycle 1 supplement (26-11-26)

Applied from the V7 SUPPLEMENT REQUEST (3 parallel PVL reviews: 1 FAIL, 10 CONCERNs). Validate Contract left as placeholder. One test helper file added to Touchpoints: `frontend/tests/helpers/api-mock.ts`.

| Item | Applied where |
|---|---|
| T1 (FAIL) smoke assertion `smoke.ts:1617` becomes `openInviteCount === 1` under D8; only allowed existing-assertion edit | B1, B3, Regression list |
| F1 keep `→` (U+2192) in `user.renamed` | D11, D19 |
| F2 locked before-row drives reinvite/revoke; issueInvite after UPDATE; archived+invited email change = expire only; policy row; NEW email from RETURNING; extra expire dropped | D8, D19, Route step 4f, A1 |
| F3 service return types, 3 callers, typecheck before forms, try/catch finally-refresh, no label change, only `user.email_changed` union member | D13 |
| T2 smoke helper rules | C1 |
| T3 frontend API test mocking rules + `tests/helpers/api-mock.ts` | D1, Touchpoints |
| T4 e2e selectors and fixture rules | E1 |
| T5 screenshot method and location | E4 |
| T6 run order B3 before C1 | B3, Regression list |
| A1 reactivating an admin-paused member accepted | Known-Gap residual 3 |
| A2 D6 lowercase compare on locked row plus writer grep | D19(h) |
| A3 cooldown-0 mail vector residual | D8, Known-Gap residual 4 |
| A4 residual 2 wording | Known-Gap residual 2 |
| A5 B1 execute instructions | D19, B1 |
| A6 authorization edge ACs | AC-17, Verification Evidence |

---

## Validate Contract

Status: PASS
Date: 26-11-26
date: 2026-11-26
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 auth/identity surface, S6 high-risk class, S7 5+ files); dominant S6. Backend and frontend are coupled through the D13 PATCH contract and a shared `contract.test.ts`, and `users.ts` / `smoke.ts` are single-writer files, so one implementing agent in order A, B, C, D, E is the lowest-risk fit. Model: opus for the implementing agent only; EVL tester and every other agent sonnet.

Gate: PASS (no FAILs, no unresolved CONCERNs; the one cycle-2 inconsistency was fixed in the plan text)
Cycle: PVL re-validate after supplement cycle 1 (16 items T1, F1-F3, T2-T6, A1-A6 verified applied and consistent).

### Dimension findings

- Infra fit: PASS - no schema, env, dependency or route change (D18); anchors re-verified 26-11-26: `users.ts` PATCH at 421 with imports at 20-45 (`lockUserForInvite`, `expireOpenInvites`, `issueInvite`, `revokeUserRefreshTokens`, `managerOwnsTeacher/Student` present as the plan says), `lib/invites.ts` 88/102/129/249 signatures match D3/D19, `ManagerTeachers.tsx:101`, `ManagerStudents.tsx:225`, `AdminManagers.tsx:116` call sites match D13, smoke helpers `outboxFor`, `activeTokenCount`, `openInviteCount`, `latestInviteToken`, `adminInvite`, `createUser`, `emailFor`, `RESEND_WAIT_MS` all exist.
- Test coverage: PASS - every developed behavior (AC-1..AC-15, AC-17) has a Fully-Automated or Hybrid gate, AC-16 an Agent-Probe; T1 FAIL resolved: `smoke.ts:1617` is exactly the `openInviteCount === 0` line (1615 the email change, 1616 the old-token 400), so the single allowed assertion edit is correctly scoped. No behavior rests on Known-Gap alone.
- Breaking changes: PASS - `PATCH /users/:id` widens for managers only inside U1/U2/D4; the `invite` key is added only on an admin invited-email change; service return types change to `{ invite? }` with the 3 callers named; bootstrap keys (18) and `SCHOOL_SCHEMA_VERSION` 3 untouched.
- Security surface: PASS - STRIDE table present; static deny before DB, in-tx ownership after row lock, identical 403 (no oracle), D4 archived guard, hash-based D5, one transaction (D3), no address in any summary; residuals are named and accepted (below).
- Section A (policy + activity): PASS - pure module, truth tables written first; A3 is a one-member union edit.
- Section B (transactional PATCH): PASS - D19 binds before-row, order, UNIQUE catch and the archived+invited edge; one inconsistency (unknown-key manager cases) fixed in the plan, see P1/P2.
- Section C (smoke `team-edits`): PASS after P1 - fixtures, helper rules and run order (B3 green before C1) are explicit.
- Section D (frontend): PASS - partial-failure rethrow, body shaping by session role, `lockEmail`, local manager-email rule, typecheck before forms.
- Section E (e2e, evidence, probe): PASS - port-check hard stop precedes e2e; selectors and fixture rules fixed; agent-probe images under `harness/`.

Open gaps: none unresolved. Named residuals (Known gaps on record below) are documented, not counted as PASS.

### Plan updates applied

- [x] Cycle-1 supplement (16 items) confirmed present and mutually consistent: T1 (B1/B3/Regression list), F1 (`→` U+2192 in D11/D19), F2 (D8/D19/Route 4f/A1), F3 (D13), T2 (C1), T3 (D1/Touchpoints `frontend/tests/helpers/api-mock.ts`), T4 (E1), T5 (E4), T6 (B3 before C1), A1-A6 (Known-Gap residuals 2-4, D19(h), AC-17).
- [x] P1: C1 optional unknown-key cases corrected. Zod `updateUserSchema` is a plain `z.object` (strips unknown keys, not strict), so `role` / `managerId` never reach the route. A manager body of only unknown keys is empty after parsing: `userPatchAccess` passes it vacuously and the empty-body check answers `400 "No fields to update"`, not 403. `{name, role:"admin"}` stays 200 with role unchanged.
- [x] P2: D19(i) added: `bodyKeys` fed to `userPatchAccess` = the defined keys of the PARSED body, so the strip behavior above is the specified behavior.
- [x] P3: Status line and Phase Loop step 4 updated to reflect the contract.

### Execute-agent instructions

- E1 (D19, Step B1): follow D19 (a)-(i) literally; the PATCH is one `db.transaction`; no tx statement after a caught PG unique violation; `user.renamed` keeps the U+2192 arrow.
- E2 (unknown keys, resolves the open point): `bodyKeys` = `Object.keys(parsedBody).filter(k => parsedBody[k] !== undefined)`. Exact expected smoke results for a manager on an own-team target: `{managerId: <uuid>}` alone -> `400` "No fields to update"; `{role:"admin"}` alone -> `400`; `{name, role:"admin"}` -> `200`, name applied, role unchanged; `{name, managerId}` -> `200`, name applied only. The same bodies at an unknown or foreign id also answer `400` (the static check and empty-body check run before any DB read), so they add no oracle. Add these four cases to smoke matrix item 3; do NOT assert 403 for them. Add a policy unit row: manager + non-self + empty key set -> `manager-team` (the route's empty-body 400 then applies).
- E3 (smoke 1617): change only that assertion: `openInviteCount === 1`, label "an email change expires the old invite and issues one new invite"; keep the old-token 400 and add `outboxFor(emailFor("inv15b")).length === 1`. No other existing assertion changes; the `profile` domain is untouched.
- E4 (order): B3 `npm run smoke` green on the 17 existing domains (with the 1617 edit) BEFORE C1 adds `team-edits`.
- E5 (lowercase writers): grep the `createUser`, import and seed writers for lowercased emails and record the result in the report (D19(h)); no schema change if not.
- E6 (imports): grep `users.ts` before removing `managerOwnsStudent` / `managerOwnsTeacher`; `managerTeam` stays.
- E7 (frontend order): `npm run typecheck` immediately after changing the service return types and BEFORE editing the three form components; write each test file red first.
- E8 (hard stops): never read backend environment files; no real mail; Hard Stop 4 port check (`netstat -ano | findstr ":3000 :3100 :4000"` prints no listener) before `npm run e2e`; no `db:reset` / `db:push` / TRUNCATE / `db:migrate`; if a listener exists on 4000, STOP and ask.
- E9 (loop discipline): EVL is a spawned vc-tester re-running the exact gates below; fixes by a spawned vc-execute-agent in supplement mode; the orchestrator writes per-cycle reports and TSV rows.

### Test gates

C3 table (the strategy column carries only the 3 proving strategies; Known-Gap is never a strategy). gap-resolution: A proven now / B gate added by this plan / C deferred / D backlog stub.

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | manager renames own-team teacher/student/enrolled-only student; one `user.renamed` row | Hybrid | `npm run smoke` (domain `team-edits`, rename checks); precondition: local Postgres + backend env file, migrations 0001-0007 applied | B |
| AC-2 | manager scope: identical 403 for unknown/foreign/admin/manager/non-teacher-student; self path kept | Fully-Automated + Hybrid | `npm run test --workspace @lumina/backend` (`user-edit-policy.test.ts`) + `npm run smoke` (`team-edits` scope checks, `profile` domain) | B |
| AC-3 | manager email/avatar/archive/`{name,email}` -> 403 with nothing applied; archived target; unknown keys per E2 | Fully-Automated + Hybrid | same vitest file + `npm run smoke` (`team-edits` restricted-field checks) | B |
| AC-4 | manager pause/reactivate; refresh revocation; invited 409; activity once each | Hybrid | `npm run smoke` (`team-edits` pause/reactivate) | B |
| AC-5 | admin email change on ACTIVE: revoke, no-op when unchanged, self keeps session, `user.email_changed` without address | Fully-Automated + Hybrid | vitest effects/summaries + `npm run smoke` (`team-edits` email checks) | B |
| AC-6 | admin email change on INVITED: old link dead, one new mail to new address, cooldown bypass, failNext, set-password at new address | Hybrid + Fully-Automated | `npm run smoke` (`team-edits` invited-email checks) + vitest effects table | B |
| AC-7 | duplicate 409 and `Promise.all` race (one 200, one 409, never 500) | Hybrid | `npm run smoke` (`team-edits` duplicate/race) | B |
| AC-8 | pure policy access matrix, effects table, summaries | Fully-Automated | `npm run test --workspace @lumina/backend` (`backend/tests/user-edit-policy.test.ts`) | B |
| AC-9 | activity hygiene: no `@`, rows on the tx (rolled-back attempt leaves none) | Hybrid + Fully-Automated | `npm run smoke` (`team-edits` activity checks) + vitest summaries | B |
| AC-10 | frontend request shaping, partial-failure message, `invite` outcome | Fully-Automated | `npm run test --workspace @lumina/frontend` (`frontend/tests/people-api-edit.test.ts`) | B |
| AC-11 | local/demo parity and `teacher.manage`/`student.manage` matrix | Fully-Automated | `npm run test --workspace @lumina/frontend` (`people-edit-rules.test.ts`, `permissions.test.ts`) | B |
| AC-12 | UI end to end (API mode): manager edit/pause, locked email, admin invited-email change | Hybrid | `npm run e2e` (`frontend/e2e/api/manager-team-edits.spec.ts`); precondition: ports 3000/3100/4000 free, Postgres + backend env file, log mailer | B |
| AC-13 | demo fence: Email disabled, name edit works, zero `/api/v1/` calls | Hybrid | `npm run e2e` (`frontend/e2e/demo/regression.spec.ts`, new test) | B |
| AC-14 | no regression: smoke profile/invites/auth/uploads/library/rebook, backend vitest, e2e account-invites/auth/uploads/curriculum-library, frontend vitest | Hybrid | `npm run smoke`; `npm run test --workspace @lumina/backend`; `npm run test --workspace @lumina/frontend`; `npm run e2e` | A |
| AC-15 | static soundness, no schema/dependency change, no new log matches | Fully-Automated | `npm run typecheck`; `npm run lint`; `git diff --check`; `git status --porcelain -- backend/src/db` (empty); `git diff --stat -- package.json package-lock.json backend/package.json frontend/package.json` (empty); the logging grep from the Exit Gate | B |
| AC-16 | manager edit form (disabled Email + note) and invite-result modal usable at 1440x950 and 390x844 | Agent-Probe | Step E4 scratch Playwright run against API-mode servers (log mailer); screenshots under `harness/`; judge: Email disabled with note, modal readable, no overflow | B |
| AC-17 | authorization edge matrix (restricted keys on any id, byte-identical 403, archived own-team, invited rename 200 / pause 409, unchanged admin email, no `@`, archived+invited email change, unknown-key bodies per E2) | Fully-Automated + Hybrid | vitest policy rows + `npm run smoke` (`team-edits`) | B |

Failing stubs (Fully-Automated rows; copied from the plan Test Plan, the red-first start at EXECUTE):

```
AC-8:  test("should deny a manager any email or avatarColor key and any archive status", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess manager restrictions") })
AC-8:  test("should allow a manager only name and active/paused status on a non-self target", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess manager-team") })
AC-8:  test("should keep self rules: self may change name, email, avatarColor, never status unless admin", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess self") })
AC-8:  test("should deny teacher and student on a non-self target before any database read", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess teacher/student") })
AC-5:  test("should treat an unchanged email as no change: no revoke, no reinvite", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: planUserPatchEffects effective change") })
AC-5:  test("should revoke sessions only when an admin changes another active person's email", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: planUserPatchEffects revokeSessions") })
AC-6:  test("should reinvite only when an admin changes an invited person's email", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: planUserPatchEffects reinvite") })
AC-9:  test("should never put an email address in an activity summary", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: emailChangeSummary") })
AC-10: test("should send only the name for a manager session and trimmed lowercase email for an admin", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: updateUser body shaping") })
AC-10: test("should report which part was saved when the profile PATCH fails after the user PATCH", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: updateTeacher partial failure") })
AC-11: test("should refuse a manager email change in the local branch and allow a name edit", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: local manager email rule") })
AC-17: test("should treat a manager body with no allowed keys after parsing as manager-team (route then answers 400)", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: userPatchAccess empty key set") })
```

Legacy line form (retained for existing consumers):
- backend policy: [Fully-automated: `npm run test --workspace @lumina/backend`]
- backend routes: [hybrid: `npm run smoke` + precondition local Postgres and backend env file, migrations through 0007]
- frontend: [Fully-automated: `npm run test --workspace @lumina/frontend`] | [hybrid: `npm run e2e` + precondition ports 3000/3100/4000 free]
- static: [Fully-automated: `npm run typecheck`; `npm run lint`; `git diff --check`; `git status --porcelain -- backend/src/db`]
- UI usability: [agent-probe: AC-16 screenshots desktop + 390 px]

Targets (minimums, exact totals recorded by EVL): backend vitest >= 13 files / >= 110 tests; frontend vitest >= 13 files / >= 75 tests; smoke >= 18 domains / >= 910 checks; e2e >= 33 API + 6 demo.

### What This Coverage Does NOT Prove

(What this coverage does NOT prove, per gate.)
- Policy vitest + smoke: an access JWT issued before a pause or an admin email change keeps working for up to 15 minutes (only refresh revocation is proven).
- Smoke ownership checks: a profile/enrollment reassignment that commits after the in-transaction ownership read is not blocked (the user-row lock serializes user-row writers only); a real-concurrency proof of the ownership race is not attempted.
- Smoke rollback checks: atomicity is shown through the duplicate/race outcomes and the zero-new-activity check; there is no DB-backed vitest tier or fault-injection proof of a mid-transaction failure.
- Frontend vitest: component rendering of the disabled Email and notes is proven only by e2e and the screenshot probe, not by a component test.
- e2e: only the log/array mailers run; no real SMTP delivery, deliverability or link rendering in a mail client; Playwright covers three API flows and one demo flow, not every role/screen.
- Agent-probe: a human-style visual judgment at two viewports; not pixel regression and not other browsers.
- Frontend roster-only visibility vs backend enrollment-broader ownership: the asymmetry is documented and pinned, not removed.

### High-risk pack

Required: yes (auth/identity, public API contract, session handling; manual-first, minimum tier Hybrid).
Location: `process/features/launch-readiness/completed/manager-team-edits_26-11-26/harness/manager-team-edits/` with `risk-gate.json` (`mustStopBeforeFinalize: true`), `context-snippets.json` (file:line for the users.ts PATCH, user-edit-policy.ts, invites lock/issue, activity.ts), `verification.json` (happy path plus boundary cases: manager 403, archived, race 409, invited reinvite, unchanged email), `review-decision.json` (explicit APPROVE/REJECT with rationale), `adversarial-validation.json` (manager email takeover, undo of an admin archive, ownership oracle, TOCTOU, mail bombing). The execute-agent writes it before closeout and states explicitly if it is missing; the work is not "ready" until `review-decision.json` is present.

### Backlog artifacts to create during durable capture

- `process/features/launch-readiness/backlog/manager-list-visibility-mismatch_NOTE_26-11-26.md` - frontend roster-only vs backend enrollment-broader scope.
- `process/features/launch-readiness/backlog/user-edit-two-call-atomicity_NOTE_26-11-26.md` - frontend user PATCH + profile PATCH are two calls.
- `process/features/launch-readiness/backlog/manager-ownership-reassign-race_NOTE_26-11-26.md` - sub-second reassignment window after the in-tx ownership read.
- Annotate (not new): `manager-edit-team-member-403_NOTE_25-11-26.md` (resolved), `account-invites-review-residuals_NOTE_25-11-26.md` item 9, `access-token-revocation_NOTE_24-11-26.md`, `per-sender-invite-limit_NOTE_25-11-26.md`.

### Known gaps on record

- Access JWT lives up to 15 minutes after pause or admin email change (gap-resolution D; existing `access-token-revocation` note, annotated).
- Ownership reassign race after the in-tx read (gap-resolution D; `manager-ownership-reassign-race_NOTE_26-11-26.md`).
- A manager may reactivate a member that an admin paused (U2; accepted, unchanged).
- Admin invited-email change uses cooldown 0 (D8): one new mail vector bounded by admin-only access and the per-IP limit until `per-sender-invite-limit` (gap-resolution D; compromised-admin mail volume accepted).
- Frontend component-level rendering untested by vitest (gap-resolution C: covered by e2e + probe; existing backlog theme "no frontend component tests").

Accepted by: session (PVL re-validate; the user's fixed decisions U1-U6, D4 and D8 stand as recorded in the plan). No CONCERN remains open; the four residuals above and the component-test gap are accepted as named Known gaps, not as proving gates.

### Execution strategy recorded at V4

| Option | Agent count | Fit |
|---|---|---|
| Sequential (RECOMMENDED) | 1 opus execute-agent (Steps A-E) + 1 sonnet vc-tester (EVL) = 2 | single-writer `users.ts`/`smoke.ts`, contract coupling between workspaces |
| Parallel subagents | 2 opus (backend A-C, frontend D) + E by one = 3 | possible once D13 is fixed; saves wall time; risk on `contract.test.ts` and typecheck coupling |
| Workflow | 5 steps x 1 agent x 1 iteration = 5 | deterministic but heavy for one plan |
| Agent team | 2 members x 2 rounds = 4 | no mid-run coordination need; not justified |

Cost guard: not triggered (at most 5 agents).

## Autonomous Goal Block

SESSION GOAL: manager-team-edits - managers rename and pause/reactivate own-team teachers/students via PATCH /users/:id; an admin email change signs out an active user or re-invites an invited one; the route becomes one transaction.
Charter + umbrella plan: N/A - standalone pre-Phase-06 fix (context only: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md, not modified).
Plan: process/features/launch-readiness/completed/manager-team-edits_26-11-26/manager-team-edits_PLAN_26-11-26.md
Autonomy: per feedback_autonomous_phase_execution.md - no approval pauses; subagent delegation stays mandatory (vc-execute-agent opus for Steps A-E; EVL by a spawned vc-tester); the orchestrator never edits source or runs gates in its own shell.
Hard stop conditions / safety constraints:
- Any real email send (smoke uses the array mailer, e2e the log mailer).
- Any db:reset, db:push, TRUNCATE or db:migrate; no schema, route, env or dependency change.
- Reading or printing backend environment files, or any token, invite link or email body.
- Port 4000 (or 3000/3100) already listening before npm run e2e: stop and ask.
- Widening manager rights beyond name + pause/reactivate of own-team teachers/students (email, avatar, archive, restore, other teams = stop and ask).
Next phase: EXECUTE: process/features/launch-readiness/completed/manager-team-edits_26-11-26/manager-team-edits_PLAN_26-11-26.md (Steps A-E, red-first)
Validate contract: inline in the plan (## Validate Contract, Gate: PASS)
Execute start: npm run test --workspace @lumina/backend (A1 red) | npm run smoke (17 domains green after the 1617 edit, then 18) | npm run e2e (ports free first) | probe: 1440x950 + 390x844 screenshots | high-risk pack: yes (harness/manager-team-edits/)

---

## Review Follow-Up (26-11-26): N1 and N2 fixed before the commit checkpoint

After the code review (report §7.2) the user chose to fix the two real findings before committing. Both are frontend-only; no backend, schema, route or dependency change.

| # | Finding | Fix |
|---|---|---|
| N1 | The API branch of `updateTeacher` / `updateStudent` never applied the manager email rule. `school.ts` drops `email` for a non-admin session, so a manager's email change was silently discarded in API mode while the UI reported success. | New `assertManagerKeepsStoredEmail(actorId, userId, nextEmail)` in `services/people.ts` reads the current users from the browser store (mirrors the local branch; an unknown actor or target falls through to the server, which enforces the same rule) and throws `ServiceError("Only an admin can change an email address.")` before any request. Pinned by new `frontend/tests/people-api-guard.test.ts` (6 tests). |
| N2 | `savedAccountOnly` threw after a successful account PATCH and discarded `saved.invite`, so an invitation issued during a failed two-call edit was invisible. | **DEVIATION (amends D13):** instead of throwing, `updateTeacher` / `updateStudent` now return `PersonEditResult = { invite?, warning? }`. The account save stays a success, `warning` carries the profile failure text, and the invite survives. The three edit handlers show `warning ?? "<name> was updated."` and still open `InviteResultModal` when `invite` is present. This also retires N3's false "Name and email were saved" copy for managers: the message is now "The account was saved, but the profile details were not". |
| AC-10 | Wording of the partial-failure criterion. | Reads: returns a success result carrying `warning` (the profile failure text) plus the invite, never losing a committed invitation. `people-api-edit.test.ts` rewritten accordingly (2 tests replaced, 1 added). |

Gates re-run after the fix, all green: `npm run typecheck`, `npm run lint`, frontend vitest **14 files / 87 tests** (was 13/80), `npm run e2e` 33 API + 6 demo with ports 3000/3100/4000 verified free first. No backend source change, so backend vitest is unaffected.
