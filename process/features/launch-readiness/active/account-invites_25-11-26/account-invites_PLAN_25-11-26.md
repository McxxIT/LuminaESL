---
name: plan:account-invites
description: "Pre-Phase-06 fix: replace the shared default account password with emailed single-use set-password links (invited status, auth_tokens table, SMTP mailer, manager team creation, frontend set-password screen)"
date: 25-11-26
metadata:
  node_type: memory
  type: plan
  feature: launch-readiness
  phase: pre-06
---

# Account Invites — Emailed Single-Use Set-Password Links

Date: 25-11-26
**Related program:** lumina-v1-finish (standalone fix that runs after Phase 05 and BEFORE Phase 06)
**Umbrella plan (context only, not modified by this plan):** process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md
**Backlog item closed:** process/features/launch-readiness/backlog/default-account-password_NOTE_24-11-26.md (HIGH, "should-fix before launch")
Complexity: COMPLEX (schema migration + auth/identity + public API contract + secrets/trust boundary + new external dependency + both workspaces)
Status: VERIFIED (with gaps) 26-11-26 - execution commit 1940ea6; EVL green (independent, twice); review approved-with-concerns; Step F real SMTP send (AC-19) pending the user, so this task folder stays in active/
**Report destination:** process/features/launch-readiness/active/account-invites_25-11-26/account-invites_REPORT_25-11-26.md
**High-risk evidence pack:** process/features/launch-readiness/active/account-invites_25-11-26/harness/account-invites/ (5 JSON artifacts, same shape as `lumina-v1-finish_23-11-26/harness/phase-03-auth/`)

TL;DR: Accounts created by admins or managers stop getting one shared password. They are created `invited`, cannot sign in, and receive a single-use link (72 h) by email to set their own password. Managers may now create teachers and students on their own team. Imported users are created `invited` with no email. Real email delivery is a hard stop that needs the user's explicit OK.

---

## Overview and Context

Standalone COMPLEX fix scheduled between Phase 05 (done) and Phase 06. Context routers read: `process/context/all-context.md`, `auth/`, `database/`, `tests/all-tests.md`, `uxui/`.

## Phase Completion Rules

CODE DONE means Steps A-E are implemented and exit gates are green in EXECUTE. VERIFIED requires the independent vc-tester EVL confirmation run, the regression list green, the high-risk evidence pack written, and the report written. The plan is never marked fully PASS while Step F (real SMTP send, user-gated) is pending: it stays VERIFIED with one CONDITIONAL known-gap (AC-19).

## Purpose

Remove the shared default password from the product and replace it with a standard invite flow, per the user decisions of 24-11-26 and 25-11-26:

1. Creating an account (admin: any role; manager: teacher or student on their own team) emails a single-use set-password link. No password is ever emailed or shown. The invited person sets their own password (existing 10-128 character policy) and cannot sign in until they do.
2. Resend invalidates the previous link. The creator sees when mail failed and can resend; a copyable link is offered only where it adds no privilege (see D9).
3. The shared default literal is removed from the backend import and the frontend bundle. One documented dev-only seed password stays in `backend/src/db/seed.ts` and the seed refuses to run when `NODE_ENV=production`.
4. Mail goes through SMTP using the existing `backend/.env` `MAIL_*` names. Tests never send real email. The first real send happens only after explicit user approval (Step F, a hard stop, not an EXECUTE step).
5. Demo mode is untouched.

Out of scope (stated so EXECUTE does not drift): self-service "forgot password" (the `auth_tokens.purpose` column leaves room for `reset`; the login screen stub stays a stub); `POST /auth/register` (unchanged, still student self-signup with a user-chosen password); `trustProxy` and the limiter store (Phase 06 backlog); the 15-minute access-token window (Phase 03 known gap); bulk invite send; a UI to re-invite an archived never-activated account; a first-admin bootstrap path for production (see Open Items).

---

## Locked Decisions (authoritative; no creative decisions at EXECUTE)

| # | Decision |
|---|---|
| D1 | New user status `invited` (enum value added by migration `0007`). Invited users hold an UNUSABLE password hash, so login, refresh and change-password already fail with the existing generic 401 texts (no account enumeration). |
| D2 | Deviation from INNOVATE, justified by verification: the unusable hash is `"!unset$" + 32 random bytes base64url`, NOT a scrypt-format string. `verifyPassword` (`backend/src/lib/password.ts:71-86`) returns false on any value that is not exactly 6 `$`-separated parts starting with `scrypt`, so it can never verify, and the fixed prefix lets the server recognize a never-activated account (`isUnusablePasswordHash`). That detection closes the "paused/archived then reactivated with no password" hole (D8). |
| D3 | New table `auth_tokens` (migration `0007`): `id, user_id (FK cascade), token_hash (unique), purpose ('invite' now, 'reset' reserved by a CHECK), expires_at, used_at, created_at` plus an index on `user_id`. Token = 32 random bytes base64url; only the sha256 hex is stored (same `hashToken` as refresh tokens, extracted to `backend/src/lib/tokens.ts`). |
| D4 | Expiry 72 hours (code constant `INVITE_TTL_HOURS = 72`, not an env var). A resend runs in ONE transaction in this exact order (S7): (1) `SELECT ... FOR UPDATE` on the user row; (2) check role/status/ownership by reading `teacher_profiles` / `student_profiles` `managerId` from the SAME tx (never call `managerOwns*(app.db)` before the lock); (3) cooldown = `now - max(auth_tokens.created_at for that user, purpose 'invite') < N s`, read under the lock; (4) expire every open invite (`expires_at = now`); (5) insert the new token. A resend cooldown (`INVITE_RESEND_COOLDOWN_SECONDS`, default 30, smoke 2, e2e 0) is a mail-bombing guard; a resend inside the window is `429 RATE_LIMITED`. |
| D5 | Consume is one conditional statement: `UPDATE auth_tokens SET used_at = :now WHERE token_hash = :h AND purpose = 'invite' AND used_at IS NULL AND expires_at > :now RETURNING user_id`, in the same transaction that sets the password hash, `status = 'active'` (`WHERE status = 'invited'`), and revokes the user's refresh tokens (`revokeUserRefreshTokens`). Order is fixed (S8): parse body -> tx: conditional token UPDATE ... RETURNING `user_id` -> `UPDATE users ... WHERE id = :uid AND status = 'invited'` requiring exactly 1 row -> `revokeUserRefreshTokens` -> `logActivity`. Zero rows at any step throws and rolls back (the token stays unconsumed) and answers one generic `400 INVALID_OR_EXPIRED_TOKEN`. Unknown, expired, used and archived-user tokens are indistinguishable. |
| D6 | Public route `POST /api/v1/auth/set-password` body `{ token, password }` (`.strict()`, password via `passwordSchema`), answers `204`, creates NO session (the person then signs in normally). Rate limited by IP only (`AUTH_RATE_LIMIT_MAX` per minute, own key generator, plus `enforceIpCeiling`). |
| D7 | `POST /users` is allowed for `admin` and `manager` (decision 4, overriding INNOVATE's "hide"). Today it is admin-only (`backend/src/routes/users.ts:162`), so a manager in API mode gets 403 even though the frontend already offers the button (`permissions.ts:97-99`); this plan makes the backend match. Manager rules: role must be `teacher` or `student` (else 403); `password` present is 403; `managerId` absent or equal to the actor (else 403) and always stored as the actor. Admin rules: `managerId` optional but, when present, must reference a `manager`-role user (400 otherwise); `password` optional (see D10). |
| D8 | Status safety (S9): detection is `isUnusablePasswordHash` (prefix `"!unset$"`), NOT status alone, so every reactivation path (PATCH, reset-password, any future one) is covered. Any `PATCH /users/:id` with `status` `active` or `paused` on a user whose hash is unusable is `409 ACCOUNT_NOT_ACTIVATED`; a PATCH to `archived`/`paused` also calls `expireOpenInvites` (defence in depth) ("send an invite instead"); `POST /users/:id/reset-password` on an `invited` user is `409 CONFLICT`; `DELETE`/archive of an invited user also expires its open invite tokens; an email change on an invited user expires its open invite tokens in the same transaction. Residual (accepted, backlog stub): an archived never-activated account cannot be re-invited (cancel = archive; fix a typo by editing the email, which is admin-only today). |
| D9 | Invite outcome in responses: `invite: { sent: boolean, mode: "smtp" \| "log" \| "array", error?: string, link?: string }`. `error` is always a generic sentence, never the SMTP error text. USER DECISION 25-11-26 (resolves review item T1, OPTION A): link exposure is ADMIN-ONLY in every mode (`log`/`array`/`smtp`, any `NODE_ENV`). `link` is returned ONLY to an `admin` actor, and only when (a) `NODE_ENV !== "production"` and mode is `log` or `array`, or (b) the send failed (any mode). A manager's create/resend response NEVER contains `link` (it would let them set a teammate's password); a manager whose send failed sees the generic error and the Resend button only. `shouldExposeInviteLink(actor, mode, sent)` truth table: manager -> false always; admin -> true when `!sent`, or when mode is `log`/`array` and not production; admin + `smtp` + sent -> false. Manager smoke flows read links from the array outbox; the manager e2e test never relies on a response `link`. INNOVATE's `{sent, error?, link?}` gains `mode` so the UI can tell "emailed" from "development, copy the link". |
| D10 | `password` on `POST /users` stays optional and ADMIN-ONLY, for admins who set one directly and for existing smoke/e2e fixtures (`backend/scripts/smoke.ts:245`, `frontend/e2e/support/api.ts:258`). With a password the user is created `active`, no token, no mail. Without one the user is created `invited` and mailed. Frontend create flows never send a password again. |
| D11 | Link format: `<APP_URL>/#set-password=<token>`. Deviation from INNOVATE's query parameter: a URL fragment is never sent to the server, so the token cannot land in access logs, reverse-proxy logs (Phase 06 Docker), or `Referer`, and a mail-scanner GET prefetch cannot consume it (consumption is a POST by the page). The page reads `window.location.hash` once on mount into React state, then clears it with `history.replaceState` on submit BEFORE the fetch; the token stays in component state so a policy-error retry still works; a `hashchange` listener picks up a link pasted into an already-open tab; the token check runs BEFORE the session bootstrap is applied, so an existing session cannot redirect first; the effect is StrictMode-safe (idempotent read, listener cleanup). Demo mode: `/#set-password=...` leaves the hash untouched and shows the normal login. `APP_URL` is never derived from request headers. |
| D12 | Env (all OPTIONAL in the zod schema, NO zod defaults, so the `Env` literals typed in `backend/tests/{app,contract,auth-lifecycle}.test.ts` keep compiling; defaults are resolved in code): `MAIL_MAILER` (`smtp` \| `log` \| `array`, resolved default `log`), `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION` (`ssl`/`smtps` = implicit TLS, default port 465; `tls`/`starttls` = STARTTLS required, default port 587; `none`/`null`/empty = plaintext, refused in production), `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` (resolved default `Lumina ESL`), `APP_URL`, `INVITE_RESEND_COOLDOWN_SECONDS`. Empty strings from the env file count as unset via one shared `emptyToUndefined` helper. `MAIL_PORT` uses `z.coerce.number().int().positive().optional()`; `INVITE_RESEND_COOLDOWN_SECONDS` uses `z.coerce.number().int().nonnegative().optional()` (nonnegative, not positive, because the e2e value `"0"` must parse; deliberate deviation from the positive-only suggestion); NO zod defaults. An explicit `MAIL_PORT` wins over the encryption default port. The mail/`APP_URL` production checks live in `superRefine` as a SEPARATE block that is not skipped by the CORS early return. EXECUTE verifies via `npm run typecheck` that the inferred `Env` keeps the new keys optional BEFORE writing the new tests. Production `superRefine` requires `MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_FROM_ADDRESS`, `APP_URL` (http(s)) and an encrypted `MAIL_ENCRYPTION`; any miss fails startup with a message naming the key (never a value). Non-production base URL fallback: `APP_URL`, else the first `CORS_ORIGIN` origin, else `http://localhost:3000`. |
| D13 | Mailer seam: `Mailer { kind; send({to, subject, text, html}) }`; `buildApp({ env, mailer? })` injects, else `createMailer(env)`; decorated as `app.mailer`. `createMailer` REFUSES `smtp` when `NODE_ENV === "test"` (so no harness can ever send real mail even if `backend/.env` says `smtp`). `array` keeps messages in memory (`outbox`, `clear()`, `failNext()` for failure tests). `log` logs only the subject and a masked recipient, never the body, token or link. SMTP uses `nodemailer` with `connectionTimeout 10s`, `greetingTimeout 10s`, `socketTimeout 15s`. Sending happens AFTER the database transaction commits and is awaited (the creator must see a failure). |
| D14 | Import (decision 5): `school-import.ts` creates every NEW user as `invited` with a fresh unusable hash and sends NO email; adopted (existing-email) users are untouched; a source status other than `active` is reset to `invited` with a counted warning. `DEFAULT_IMPORT_PASSWORD` and the `defaultPasswordHash` option are removed (the route no longer hashes). Creators send invites later per user from the admin screens; bulk send is out of scope. |
| D15 | Seed: `backend/src/db/seed.ts` keeps its single documented dev-only password constant (`DEMO_PASSWORD`, seed.ts:28) and calls a new pure `assertSeedAllowed(process.env.NODE_ENV)` (`backend/src/db/seed-guard.ts`) as the first statement after the imports and BEFORE `const env = loadEnv();` (seed.ts:24; the `dotenv/config` import is line 1), so it refuses `production` regardless of mail config. `reset.ts` already refuses production (reset.ts:28). |
| D16 | Frontend: `UserStatus` gains `invited` and, in the SAME commit, `setPersonStatus` narrows its parameter to `"active" | "paused"` (S15, explicit in D1/D3) (`SCHOOL_SCHEMA_VERSION` stays 3: additive, and no cached or seeded record carries the value). Invited rows show an "Invited" badge and a "Resend invite" action in place of Pause/Reactivate and Reset password. Demo mode hides every invite control, never calls `/api/v1`, and ignores a `#set-password` hash. A teacher or student who is `invited` is not selectable in booking/scheduling pickers until they accept (existing `status === "active"` filters, e.g. `ManagerSchedule.tsx:63,87`); that is intended. |
| D17 | Activity (backend `ActivityAction`, activity.ts:13-): add `user.invite_resent`, `user.invite_accepted`. Creation keeps the existing `user.created` / `{role}.created` action (no extra row). EXECUTE confirms the frontend label map in `frontend/app/lib/school/notifications.ts` needs no change for unknown actions, else adds the two labels. |
| D18 | Mail content: plain-text and HTML, subject "Set your Lumina ESL password", greeting by name (HTML-escaped), the link, the 72-hour expiry, no password, no inviter's personal data. Pure renderer `renderInviteEmail`. |

---

## HARD STOPS (the plan must stop and ask; none of these is an EXECUTE step)

1. **First real SMTP send.** No agent sends a real email at any point in Steps A-E. Step F (below) is the only place a real send happens, and only after the user explicitly says so and names the recipient address. Until then every gate uses the `array` mailer (smoke, vitest) or the `log` mailer (Playwright backend), and `createMailer` throws if `smtp` is requested under `NODE_ENV=test`.
2. Any `db:reset`, `db:push`, `TRUNCATE`, or data mutation on dev `lumina` other than `npm run db:migrate` applying `0007` (additive: one enum value, one new table).
3. Printing, logging, committing or copying any `MAIL_PASSWORD`, `JWT_SECRET`, token, invite link, or the shared default literal. Agents never read `backend/.env` or `backend/.env.example` (privacy hook); key names are known from the orchestrator, values never.
4. Before running `npm run e2e`: ports 3000, 3100 and 4000 must be free. The API Playwright config reuses an existing backend on 4000 (`reuseExistingServer`), and a backend started from `backend/.env` could be in `smtp` mode. If anything listens on 4000, STOP and ask.

---

## Entry Gate

- Phase 05 complete (execution commit `5c1b4b9`, process commit `c6d2e19`); working tree clean on `developing`.
- Migrations `0001`-`0006` applied on dev `lumina`; next free number `0007`.
- Baselines to keep or beat: backend vitest 7 files / 61 tests, frontend vitest 10 files / 54 tests, smoke 16 domains / 705 checks, e2e 27 API + 4 demo.
- `nodemailer` is not installed (verified: no `node_modules/nodemailer`); registry latest is `10.6.1` (engines node >=20) and `@types/nodemailer` `8.0.2` (checked 25-11-26); EXECUTE re-verifies before install.

---

## Schema (migration 0007, additive only)

Generate with `npm run db:generate`, review the SQL by hand, apply with `npm run db:migrate`. Never `db:push` / `db:reset` / TRUNCATE. Never hand-edit the journal or snapshot.

1. `backend/src/db/schema.ts:25-29` `userStatus`: append `"invited"` after `"archived"`.
2. `backend/src/db/schema.ts` after `refreshTokens` (ends line 118): new `authTokens` table `auth_tokens`:

| Column | Type | Constraint |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | not null, FK `users.id` `onDelete: cascade` |
| `token_hash` | text | not null, unique |
| `purpose` | text | not null; table CHECK `auth_tokens_purpose_check` `purpose in ('invite','reset')` (`reset` reserved, no route issues it) |
| `expires_at` | timestamptz | not null |
| `used_at` | timestamptz | null |
| `created_at` | timestamptz | not null, default now |
| index | | `auth_tokens_user_idx` on `user_id` |

`check` is already imported in schema.ts (line 4) and used for `library_items_status_check` (Phase 04 F4); mirror that call shape.

Migration review checklist (A2):
- File is `0007_*.sql`; it contains only `ALTER TYPE "public"."user_status" ADD VALUE 'invited';`, `CREATE TABLE "auth_tokens"`, the FK constraint, the unique constraint, `CREATE INDEX "auth_tokens_user_idx"`, and the CHECK. No `DROP`, no `ALTER COLUMN`, nothing on existing tables other than the enum value.
- The migration must NOT use the new enum value in the same file (PostgreSQL cannot use a freshly added enum value inside the transaction that added it); it does not.
- `meta/_journal.json` gains one entry and `meta/0007_snapshot.json` is generated; `0005_*` and `0006_*` files are unchanged (compare hashes).
- `npm run db:migrate` run twice; the second is a no-op.
- Rollback is forward-only: an enum value cannot be removed; to retire the feature, stop issuing invites and drop `auth_tokens` in a later migration.

---

## Backend Design

### New and changed modules

| File | Role |
|---|---|
| `backend/src/lib/tokens.ts` (new) | `hashToken(token)` (sha256 hex, moved verbatim from `routes/auth.ts:75-77`), `generateToken()` (32 random bytes base64url). `routes/auth.ts` imports it and drops its local copy. |
| `backend/src/lib/password.ts` | add `UNUSABLE_PASSWORD_PREFIX = "!unset$"`, `unusablePasswordHash()`, `isUnusablePasswordHash(hash)`. |
| `backend/src/lib/invites.ts` (new) | constants (`INVITE_TTL_HOURS = 72`); pure helpers `inviteExpiry(now)`, `inviteLink(baseUrl, token)`, `appBaseUrl(env)`, `cooldownRemainingSeconds(lastCreatedAt, now, cooldown)`, `shouldExposeInviteLink({nodeEnv, mailerKind, sent, actorRole})`; DB helpers `issueInvite(tx, userId, {now, cooldownSeconds})` (locks the user row, checks status `invited` and cooldown, expires open invites, inserts the new token, lazily deletes that user's invite rows expired more than 7 days ago), `consumeInvite(tx, rawToken, now)`, `expireOpenInvites(tx, userId, now)`; orchestrator `deliverInvite({app, user, token, actorRole})` returns the `invite` response object and never throws (a send failure becomes `sent:false` + generic `error`, with one `request.log.warn` carrying only the error code). |
| `backend/src/lib/invite-email.ts` (new) | pure `renderInviteEmail({name, link, hours, schoolName})` returning `{subject, text, html}`; HTML-escapes the name. |
| `backend/src/lib/mailer.ts` (new) | `Mailer` interface, `createSmtpMailer`, `createLogMailer`, `createArrayMailer`, `createMailer(env, logger)`, pure `buildSmtpOptions(env)`, `resolveMailSettings(env)`. |
| `backend/src/config/env.ts` | add the 10 optional keys (D12) after line 30 and extend `superRefine` (line 32); empty-string preprocessing; no defaults. |
| `backend/src/types/fastify.d.ts:13-22` | add `mailer: Mailer` to `FastifyInstance`. |
| `backend/src/app.ts:17-19,21,37,120-121` | `BuildAppOptions` gains `mailer?: Mailer`; `app.decorate("mailer", mailer ?? createMailer(env, ...))` next to `app.decorate("config", env)`. Phase 06 later adds `/health/ready` to the same file (sequential, no conflict). |
| `backend/src/db/seed-guard.ts` (new) + `seed.ts` | pure `assertSeedAllowed(nodeEnv)`; seed.ts calls it before `const env = loadEnv();` (seed.ts:24; seed.ts:5 is only the import). |
| `backend/src/lib/activity.ts:13-` | add the two actions (D17). |

### Routes

| Method + path | Guard | Behavior | Errors |
|---|---|---|---|
| `POST /users` (users.ts:160-210, rewritten) | `requireRole(["admin","manager"])` | Rules D7/D10. ALL reads and writes (duplicate-email check, user insert, profile insert with `managerId`, token insert, `logActivity(tx, ...)`) run inside ONE `db.transaction`; `isUniqueViolation` is mapped to 409 inside the tx; mail is sent only after commit. A forced profile-insert failure leaves no `users` row and no token (rollback test, AC-20). Duplicate email: pre-check plus `isUniqueViolation` mapped to 409. Returns 201 with the public user plus `invite` when invited. | 400 validation / `managerId` not a manager; 403 manager creating admin/manager, manager sending `password`, manager naming another `managerId`; 409 email |
| `POST /users/:id/invite` (new) | `requireRole(["admin","manager"])` | Admin: any `invited` user. Manager: `invited` teacher or student on their own team (ownership read from the profile `managerId` inside the tx, NOT `managerOwns*(app.db)` before the lock; same rule as `managerOwnsTeacher` / `managerOwnsStudent`, scope.ts:105-136). Order per D4/S7: row lock, role/status/ownership, cooldown (`max(auth_tokens.created_at)`), expire open tokens, insert; one transaction; mail after commit; logs `user.invite_resent`. 200 `{ invite }`. | 403 manager for unknown, out-of-team or non-teacher/student target (no existence oracle); 404 unknown id for admin; 409 status not `invited`; 429 inside cooldown |
| `POST /auth/set-password` (new, auth.ts) | public, IP-limited (D6) | Consume per D5 (order: parse body, then one tx: conditional token UPDATE, `UPDATE users ... WHERE id AND status = 'invited'` requiring 1 row, `revokeUserRefreshTokens`, `logActivity` `user.invite_accepted` with actor = the user). 204. | one generic 400 `INVALID_OR_EXPIRED_TOKEN`; 400 `VALIDATION_ERROR` for a password outside policy (the token is NOT consumed on validation failure: parse first, consume second) |
| `PATCH /users/:id` (users.ts:212-313) | unchanged guard | add D8 rules; `status` zod enum stays `active|paused|archived` (an API caller can never set `invited`); email change on an invited user runs in a transaction with `expireOpenInvites`. | 409 `ACCOUNT_NOT_ACTIVATED` |
| `POST /users/:id/reset-password` (users.ts:315-354) | unchanged | 409 `CONFLICT` when target status is `invited`. | |
| `DELETE /users/:id` (users.ts:356-379) | unchanged | also `expireOpenInvites`. | |
| `GET /users`, `GET /teachers`, `GET /students` list filters (users.ts:36, teachers.ts:13, students.ts:18) | unchanged | `status` filter enums gain `invited`; response row types `teachers.ts:55`, `students.ts:48` widened (use the schema enum type). | |

`routes/auth.ts` also gets `setPasswordRateLimitKey` (total, never throws: `auth-set-password:${requestIp(request)}`) next to the other key generators (auth.ts:92-122) and the route uses `preHandler: enforceIpCeiling` + `config: { rateLimit: authRateLimit(setPasswordRateLimitKey) }` exactly like `/login` (auth.ts:237-242).

### Bootstrap and other readers

`GET /school/bootstrap` (`routes/school.ts`) passes `users.status` through; no key change (18 collection keys, `SCHOOL_SCHEMA_VERSION` 3). A manager's team users therefore include `invited` rows automatically. `canAccessAttachment`, bookings, credits are untouched.

### Import and seed

`backend/src/lib/school-import.ts`: delete `DEFAULT_IMPORT_PASSWORD` (line 392); `buildImportPlan` options (line 425) drop `defaultPasswordHash`; the user rows (lines ~521-535) get `passwordHash: unusablePasswordHash()` (fresh per row, cheap, no scrypt) and `status: "invited"`; a non-`active` source status emits one counted warning. `routes/school-import.ts`: remove the `DEFAULT_IMPORT_PASSWORD` import (line 8), the `hashPassword` call (line 67) and the `defaultPasswordHash` arguments (lines 53, 76). The source payload `status` zod enum (school-import.ts:47) stays.

### Logging and secrets rules (apply to every new file)

Never log: raw tokens, links, request bodies, `MAIL_PASSWORD`, SMTP error text sent to clients. Fastify does not log bodies by default and the token travels in a POST body and a URL fragment, so it never appears in a logged URL. Client-visible mail errors are the fixed sentence "The invitation email could not be sent." A grep gate (Step E) fails if a new file passes `token`, `link`, `text`, `html` or `MAIL_PASSWORD` to a logger call.

---

## Frontend Design

### Data layer and API

- `frontend/app/lib/school/types.ts:18` `UserStatus` += `"invited"`; `frontend/app/lib/api/types.ts:9` `ApiUser.status` widened; new `InviteOutcome { sent; mode; error?; link? }` exported from `lib/api/types.ts`.
- `frontend/app/lib/api/client.ts:99-105` `isPublicAuthPath` += `/auth/set-password`.
- `frontend/app/lib/api/auth.ts`: `setPasswordWithToken(token, password)` posting `{token, password}` with `auth: false` (204 is handled by `parse`, client.ts:143).
- `frontend/app/lib/school/api/school.ts`: delete `DEFAULT_ACCOUNT_PASSWORD` (line 18) and its use (line 55); `createUser` returns `ApiUser & { invite?: InviteOutcome }`; `createTeacher` (lines 81-94) and `createStudent` (lines 116-121) return `{ userId, invite? }`; new `resendInvite(userId)` calling `POST /users/:id/invite`. The follow-up `PATCH /teachers|students/:id` profile calls stay (headline, level, guardian...); team assignment already happened atomically in `POST /users` (D7). `updateStudentProfile` (line 128) must not send `managerId` for a manager actor: pass it only when the caller is admin (the backend rejects a manager sending `managerId`, students.ts:193).
- `frontend/app/lib/school/services/people.ts`: `createManager` (74-97), `createTeacher` (112-147), `createStudent` (209-246) API branches return the user with status `invited` and an optional `invite` (`ServiceResult<SchoolUser & { invite?: InviteOutcome }>`, local branches unchanged); new `resendInvite(actorId, userId)` (API only; the local branch returns a ServiceError "Invitations are not used in demo mode"); `setPersonStatus` (line 323) type narrows to `"active" | "paused"`.
- `frontend/app/lib/school/permissions.ts:10-39,89-99` (intentional asymmetry, covered by a test in D6: a student enrolled with a team teacher but carrying another manager's `managerId` is `false` in the frontend and `true` in the backend `managerOwnsStudent`): new action `account.invite` = admin, or manager when the target teacher's `managerId` (via `managerIdForTeacher`) or the target student's roster manager (via `managerIdForStudent`) is the actor. The frontend is intentionally no looser than the backend (backend `managerOwnsStudent` also counts enrollment with a team teacher). `teacher.create` / `student.create` already allow admin and manager (lines 97-99) and now match the backend.

### UI

- `frontend/app/components/manager/parts.tsx:15` `userStatusLabel` += `invited: "Invited"`; `frontend/app/globals.css` append-only `.manager-status-invited` rule next to the existing `.manager-status-paused` rule (Phase 05 owns the file and is DONE; no conflict).
- New `frontend/app/lib/auth/invite-hash.ts`: pure `readSetPasswordToken(hash: string): string | null` (accepts only `#set-password=` plus 20-128 chars of `[A-Za-z0-9_-]`) and `clearInviteHash()` (`history.replaceState(null, "", pathname + search)`).
- New `frontend/app/components/SetPasswordScreen.tsx`: same `auth-shell`/`auth-card` layout as `LoginScreen`; fields "New password" and "Confirm password" (client check: match, 10-128 characters); on submit it clears the hash FIRST, then calls the API; success panel "Password set" with a "Continue to sign in" button; failure shows "This invitation link is invalid or has expired. Ask your school contact to send a new one." (or the policy message for a 400 `VALIDATION_ERROR`). `data-testid`s: `set-password-form`, `set-password-success`, `set-password-error`.
- `frontend/app/components/LuminaApp.tsx`: in a mount effect (not a state initializer, to avoid a hydration mismatch) read the token when `!isDemoMode()`; when a token is held, render `SetPasswordScreen` BEFORE the `booting` check (line ~198) and the login render (line 205); "Continue to sign in" drops the token so the normal flow renders. Demo mode never reads the hash.
- `frontend/app/components/LoginScreen.tsx`: add one API-mode line under the form: "Invited? Open the link in your invitation email to set your password." (copy only; the demo note at the bottom stays).
- New `frontend/app/components/manager/InviteForms.tsx`: `InviteResultModal` (`data-testid="invite-result"`): `mode "smtp"` + `sent` -> "Invitation emailed to {email}"; `mode log/array` -> "Email sending is not configured (development). Copy the link below" with a read-only input `data-testid="invite-link"` and a Copy button; `sent:false` -> the generic error, a "Resend invite" button (`data-testid="invite-resend"`), and the copy field only when `link` is present (admin on failure, D9).
- Invite result for a manager actor never shows a link field (D9); e2e asserts no `invite-link` element for managers.
- Wire the three create flows: `AdminManagers.tsx:95`, `ManagerTeachers.tsx:79-82`, `ManagerStudents.tsx:108-116`: replace the "They can sign in with {email}" notice with the invite result modal in API mode (demo keeps its existing notice). Row actions: for `status === "invited"` rows show "Resend invite" (gated by `account.invite`) instead of Pause/Reactivate (`AdminManagers.tsx:86`, `ManagerTeachers.tsx:139`, `ManagerStudents.tsx:161`) and hide "Reset password" (admin reset on an invited user is 409). The manager form never shows a password field (none exists today) and the admin form keeps the manager picker.
- Demo fence: every new control checks `isApiDataMode()`/`!isDemoMode()`; `SetPasswordScreen` and the hash read are API-mode only; the demo regression asserts zero `/api/v1/` calls.

---

## Data Flow and Failure Modes (architecture note, prose)

Create: the browser posts `POST /users` without a password; the route validates role and team rules, opens one transaction that inserts the user (`invited`, unusable hash), its profile with the creator's `managerId`, one hashed invite token and the activity row, commits, then renders the email and calls `app.mailer.send`. The response carries the user plus the `invite` outcome. Accept: the invitee opens `<APP_URL>/#set-password=<token>`; the page clears the fragment and posts `{token, password}`; the server parses the body, then in one transaction consumes the token, writes the scrypt hash, sets `active` and revokes refresh tokens; the person signs in through the normal login.

Failure modes and the answer to each:

| Failure | Behavior |
|---|---|
| SMTP down/slow/rejected | user and token already committed; response `invite.sent=false` + generic error; creator uses Resend (cooldown applies); admin also gets the link; timeouts bound the request to about 15 s |
| Process dies between commit and send | user stays `invited` with a valid token nobody received; creator sees "Invited" and presses Resend; no orphan state |
| Double click / parallel resend | row lock serializes; the second request hits the cooldown (429); exactly one open token afterward |
| Two parallel set-password with one token | conditional UPDATE: exactly one 204, the other generic 400 |
| Token expires (72 h) / reused / forged | identical generic 400; no oracle |
| User archived or paused after invite, before accept | `UPDATE users ... WHERE status = 'invited'` finds no row, transaction rolls back, generic 400 |
| Email typo | admin edits the email (expires open tokens) then Resend; manager cannot PATCH another user today (users.ts:221) and asks an admin (known gap, backlog) |
| Mail scanner prefetches the link | a GET of a fragment URL sends no token and the page only consumes on submit |
| Production misconfigured (no SMTP/APP_URL) | `loadEnv` throws at startup naming the key; the app never boots with a silent log mailer |
| Real `.env` says `smtp` while tests run | `createMailer` throws under `NODE_ENV=test`; smoke and Playwright override the mailer and env explicitly |
| Imported or dev-only users | created `invited`; nothing is mailed until a creator presses Resend |

---

## Security (STRIDE scan, vc-security equivalent)

| Threat | Mitigation in this plan |
|---|---|
| Spoofing: token guessing | 256-bit random token, sha256 at rest, IP-limited route, generic 400, single-use, 72 h |
| Spoofing: manager impersonates a teammate by receiving the link | link never returned to managers in any mode (D9, user decision 25-11-26); managers cannot send `password`; manager resend limited to own-team invited users |
| Information disclosure: email enumeration via 409 on manager create | ACCEPTED: `/auth/register` already exposes duplicate emails; no new oracle class |
| DoS/abuse: set-password limiter behind a proxy | inherits the `trustProxy` gap (Phase 06 backlog `trust-proxy-and-limiter-store`); token, link and email body are never logged |
| Tampering: partial create (user without profile or token) | `POST /users` and `POST /users/:id/invite` run every read/write in one `db.transaction`, `isUniqueViolation` mapped to 409 inside it, mail only after commit |
| Tampering: privilege escalation through create | manager role fixed to teacher/student, `managerId` forced to actor, admin `managerId` must be a manager-role user |
| Tampering: status bypass via PATCH | D8: no `active`/`paused` PATCH on an unusable hash; `invited` is not settable through the API |
| Repudiation | activity rows for create, resend, accept; actor ids recorded |
| Information disclosure: token/link/SMTP detail in logs or errors | no body logging, fixed client error sentence, `log` mailer prints no body, grep gate, fragment-only link |
| Information disclosure: account enumeration | login for invited users fails with the same 401 as a wrong password (hash unusable); set-password errors are one code; manager invite on a foreign target is 403 (not 404) |
| DoS: mail bombing / SMTP stall | resend cooldown, per-route and IP limits, bounded SMTP timeouts, send never inside a DB transaction |
| Elevation: secrets in repo | `MAIL_PASSWORD` only from env, never printed; production refuses weak mail config; seed refuses production |
| Phishing via attacker-controlled link base | `APP_URL` from config only, never from `Host`/`Origin`/`X-Forwarded-*` |

---

## Risk Predictions (vc-predict equivalent, 5-persona pre-implementation debate)

| Persona | Prediction | Handled by |
|---|---|---|
| Security engineer | Link in a manager response would be an account-takeover primitive | D9 (link admin-only in every mode, manager never; dev link only outside production) |
| Backend engineer | `ALTER TYPE ADD VALUE` plus use in one migration transaction fails; enum value cannot be rolled back | A2 checklist, forward-only rollback note |
| Test engineer | A developer `.env` with `smtp` silently sends real mail from smoke or e2e | D13 refusal under `NODE_ENV=test`, explicit smoke/Playwright overrides, Hard Stop 4 |
| Frontend engineer | Hydration mismatch if the hash is read in render; token left in history | mount-effect read, `replaceState` before the network call, fragment link |
| Release engineer | Phase 06 Docker/CI will break without `APP_URL`/`MAIL_*` and the seed guard removes the only first-admin path | Registry addendum, Open Items 2 and 3, env keys optional outside production |

Highest-risk checklist items (vc-scenario equivalent) and their edge cases are folded into steps C1 (manager creation: manager sends `role: "admin"`, `managerId` of another manager, `password`; admin sends `managerId` of a non-manager; duplicate email race maps 23505 to 409; mail throws after commit), C2/E (parallel resend, resend during cooldown, resend for an active user, manager on a foreign-team invited user), and C4 (parallel set-password, expired by fixture update, wrong-length password does not consume the token, user archived mid-flight).

---

## Blast Radius (verified 25-11-26)

**New (backend):** `backend/src/db/migrations/0007_*.sql`, `backend/src/db/migrations/meta/0007_snapshot.json`, `backend/src/lib/{tokens,invites,invite-email,mailer}.ts`, `backend/src/db/seed-guard.ts`, `backend/tests/{invites,mailer,invite-email,env-mail,seed-guard}.test.ts`.
**Modified (backend):** `backend/package.json`, root `package-lock.json`, `backend/src/db/schema.ts`, `backend/src/db/migrations/meta/_journal.json` (generated), `backend/src/db/seed.ts`, `backend/src/config/env.ts`, `backend/src/types/fastify.d.ts`, `backend/src/app.ts`, `backend/src/lib/{password,activity,school-import}.ts`, `backend/src/routes/{users,auth,teachers,students,school-import}.ts`, `backend/tests/{password,school-import,contract,app}.test.ts` (contract/app only if route assertions or env literals need it), `backend/scripts/smoke.ts`.
**New (frontend):** `frontend/app/lib/auth/invite-hash.ts`, `frontend/app/components/SetPasswordScreen.tsx`, `frontend/app/components/manager/InviteForms.tsx`, `frontend/tests/invite-hash.test.ts`, `frontend/e2e/api/account-invites.spec.ts`.
**Modified (frontend):** `frontend/app/lib/school/types.ts`, `frontend/app/lib/api/{types,client,auth}.ts`, `frontend/app/lib/school/api/school.ts`, `frontend/app/lib/school/{permissions}.ts`, `frontend/app/lib/school/services/people.ts`, `frontend/app/components/{LuminaApp,LoginScreen}.tsx`, `frontend/app/components/manager/{parts,ManagerTeachers,ManagerStudents}.tsx`, `frontend/app/components/admin/AdminManagers.tsx`, `frontend/app/globals.css` (append-only), `frontend/app/lib/school/notifications.ts` (only if the label map needs the two new actions), `frontend/tests/permissions.test.ts`, `frontend/playwright.config.ts` (two backend env keys), `frontend/e2e/api/import.spec.ts`, `frontend/e2e/demo/regression.spec.ts`.
**Code-adjacent docs edited in EXECUTE:** `README.md` (~line 108 sentence: seeded dev accounts only; accounts created in the app use invitations), `frontend/PROGRESS.md:54-58`, `frontend/CUTOVER_PLAN.md:40` (clarify "seeded dev accounts only"; the seed literal itself stays documented there because the seed keeps it).
**Context docs updated at UPDATE PROCESS (not in EXECUTE):** `process/context/auth/{all-auth,jwt-cookie-flow,roles-and-scope,demo-vs-api-mode}.md` (jwt-cookie-flow.md:45-46 default-password gotcha rewritten), `process/context/database/{all-database,schema-and-models,migrations-workflow}.md` and `seed-and-reset.md:16` (seed guard), `process/context/tests/all-tests.md` (counts, new spec, mail override rule), `process/context/uxui/{app-shell-and-roles,school-data-layer}.md`, `process/context/all-context.md` (env names, care-area lines), `process/features/people-billing/_GUIDE.md:49`, backlog notes (see UPDATE PROCESS list).

**NOT touched:** `backend/src/routes/{lessons,bookings,uploads,library,courses,credits,requests,enrollments,notifications,school}.ts`, `backend/src/lib/{scope,credits,refresh-tokens}.ts`, migrations `0001`-`0006`, `frontend/app/lib/data.ts`, `frontend/playwright.demo.config.ts`, `frontend/app/lib/school/{store,seed}.ts`, `SCHOOL_SCHEMA_VERSION`.

**Overlap with Phase 06 (recorded in the registry addendum):** `backend/src/app.ts`, `README.md`, `frontend/playwright.config.ts`, `package-lock.json` + `backend/package.json` (Phase 06 CI runs `npm ci`; this fix verifies it locally), `backend/scripts/smoke.ts` (Phase 06 only runs it), and production env: Phase 06's compose file must supply `NODE_ENV=production` mail keys and `APP_URL`, and its Docker flow cannot use `db:seed` in production. Sequential order (this fix first) resolves all of it.

**Risk class:** auth/identity, schema/migration, public API contract, secrets/trust boundary. Minimum tier Hybrid for each; high-risk evidence pack required.

---

## Implementation Checklist

Per-step gates run at the end of each step. Steps A-D run `npm run typecheck`, `npm run lint`, backend vitest (and frontend vitest from D); Step C also runs the EXISTING `npm run smoke` (16 domains, must stay green before new domains are added); Step E runs everything. TDD: every Fully-Automated scenario below is written as a failing test first (see the Test Plan stubs).

### Step A — Schema, token primitives

- [x] A1. `backend/src/db/schema.ts`: add `"invited"` to `userStatus` (25-29); add `authTokens` (table, CHECK, index) after `refreshTokens` (ends 118). Export row types if the file does so for neighbors.
- [x] A2. (S1) `0007` must not reference `'invited'` anywhere (no column default, CHECK, index predicate or INSERT); record the exact `ALTER TYPE ... ADD VALUE 'invited';` line in the report; confirm it applies on the local PostgreSQL 17 and note PostgreSQL >= 12 is required for `ADD VALUE` inside a migration transaction; dev `db:migrate` only. `npm run db:generate`; review `0007_*.sql` against the migration checklist; `npm run db:migrate` twice; `git status --porcelain -- backend/src/db` lists only `schema.ts`, `0007_*.sql`, `meta/0007_snapshot.json`, `meta/_journal.json`.
- [x] A3. Create `backend/src/lib/tokens.ts` (`hashToken`, `generateToken`); in `routes/auth.ts` import `hashToken` and delete the local function (75-77). Mechanical, no behavior change.
- [x] A4. `backend/src/lib/password.ts`: unusable-hash helpers; extend `backend/tests/password.test.ts` (verify returns false, two hashes differ, prefix detection, a real scrypt hash is not "unusable").
- [x] A5. Create `backend/src/lib/invites.ts` pure helpers first (red-first `backend/tests/invites.test.ts`: token length/charset and uniqueness, hash differs from token and is 64 hex chars, `inviteExpiry` is exactly 72 h, `inviteLink` builds `<base>/#set-password=<token>` and trims a trailing slash, `appBaseUrl` precedence and "never from a header" by signature, `cooldownRemainingSeconds` edges, `shouldExposeInviteLink` truth table), then the DB helpers `issueInvite` / `consumeInvite` / `expireOpenInvites` (exercised by smoke, Step E). Gate: typecheck, lint, vitest.

### Step B — Mailer, env, dependency, harness guards

- [x] B1. EXECUTE re-checks `npm view nodemailer version engines` and `npm view @types/nodemailer version`, confirms the `createTransport({ host, port, secure, requireTLS, auth, connectionTimeout, greetingTimeout, socketTimeout })` / `sendMail({ from, to, subject, text, html })` API against the installed package's README or types (vc-docs-seeker), then `npm install nodemailer@^10.6.1 --workspace @lumina/backend` and `npm install -D @types/nodemailer@^8.0.2 --workspace @lumina/backend`. `git diff --stat package-lock.json backend/package.json` shows only those packages. Then run `npm ci` ONCE (no node processes running) and confirm the lockfile diff is still limited to nodemailer and @types/nodemailer (S5).
- [x] B2. `backend/src/config/env.ts`: optional keys and production `superRefine` (D12; mail/`APP_URL` checks in a separate block not affected by the CORS early return; shared `emptyToUndefined`; `MAIL_PORT` `.int().positive().optional()`, cooldown `.int().nonnegative().optional()`; no zod defaults; explicit `MAIL_PORT` wins over the encryption default; run `npm run typecheck` to confirm the inferred `Env` keeps the new keys optional BEFORE writing `env-mail.test.ts`); red-first `backend/tests/env-mail.test.ts`: all keys absent parses; empty strings parse as unset; production without smtp/host/from/APP_URL fails naming each key (never a value); production with `log`/`array` fails; production plaintext `MAIL_ENCRYPTION` fails; existing production CORS guard still passes its tests (`db-types.test.ts`); existing typed `Env` literals still typecheck.
- [x] B3. `backend/src/lib/mailer.ts`, `backend/src/lib/invite-email.ts`, `types/fastify.d.ts`, `app.ts` wiring; red-first `backend/tests/mailer.test.ts` (array stores and can `failNext`; log never logs body/link; `createMailer` with `smtp` under `NODE_ENV=test` throws; `buildSmtpOptions` maps `ssl`->secure/465, `tls`->requireTLS/587, `none`->plain, auth only when both credentials set, timeouts set; no network used) and `backend/tests/invite-email.test.ts` (contains link and "72"; escapes `<script>` in the name; contains no word "password" other than the phrase "set your password"; subject fixed).
- [x] B4. Harness guards, BEFORE any later gate runs: `frontend/playwright.config.ts` backend webServer `env` (line ~45) gains `NODE_ENV: "development"` (explicit), `MAIL_MAILER: "log"` and `INVITE_RESEND_COOLDOWN_SECONDS: "0"`; EXECUTE confirms `backend/src/index.ts` loads dotenv with `import "dotenv/config"` (line 1, which does not override already-set variables) so these webServer values win over the env file; `backend/scripts/smoke.ts` `loadEnv` (lines 60-69) gains `MAIL_MAILER: "array"` and `INVITE_RESEND_COOLDOWN_SECONDS: "2"`, creates `const mailer = createArrayMailer()` and passes `buildApp({ env, mailer })` (line 1662); smoke startup asserts `env.NODE_ENV === "test"` and `mailer.kind === "array"` and aborts otherwise.
- [x] B5. Gate: typecheck, lint, vitest (new files green, old files unchanged), `grep -n "MAIL_MAILER" frontend/playwright.config.ts backend/scripts/smoke.ts` shows both overrides.

### Step C — Backend routes, import, seed guard

- [x] C1. Rewrite `POST /users` (D7, D10) per the route table: ONE `db.transaction` for dup-email check, user insert, profile insert with `managerId`, token insert and `logActivity(tx, ...)`; `isUniqueViolation` -> 409 inside the tx; mail after commit via `deliverInvite`; `activity.ts` actions (D17). Red-first test: forced profile-insert failure leaves no `users` row and no token (AC-20).
- [x] C2. Add `POST /users/:id/invite` with the D4/S7 order (row lock first, then role/status/ownership from the tx, then cooldown from `max(created_at)`, expire, insert), single transaction, mail after commit.
- [x] C3. `PATCH`/`reset-password`/`DELETE` guards (D8; check `isUnusablePasswordHash`, not status alone, on every reactivation path; PATCH to archived/paused calls `expireOpenInvites`; tests: invite -> archive -> PATCH active = 409, and the old token of an archived user = generic 400); list enums and row types in `users.ts`, `teachers.ts`, `students.ts`.
- [x] C4. `POST /auth/set-password` with limiter key; order per D5/S8: parse body, then one tx (conditional token UPDATE, `UPDATE users ... WHERE id AND status = 'invited'` requiring 1 row, `revokeUserRefreshTokens`, log); any miss throws the generic 400 and rolls back so the token stays unconsumed.
- [x] C5. `school-import.ts` and `routes/school-import.ts` per D14; update `backend/tests/school-import.test.ts` (new users are `invited` with an unusable hash, a non-active source status yields the warning, adopted users untouched, the option is gone). In the SAME step remove the `defaultPasswordHash` arguments at `backend/tests/school-import.test.ts:94` and `:457` (S16).
- [x] C6. (S4) `backend/src/db/seed-guard.ts` + `assertSeedAllowed(process.env.NODE_ENV)` as the first statement after the imports in `seed.ts`, BEFORE `const env = loadEnv();` (seed.ts:24); write backlog stub `production-first-admin-bootstrap_NOTE_25-11-26.md` (MEDIUM, blocks a real production deploy) and reference it as a Phase 06 prerequisite in the registry addendum; red-first `backend/tests/seed-guard.test.ts` (production throws, development/test pass, message names `NODE_ENV`).
- [x] C7. Gate: typecheck, lint, vitest, `npm run smoke` (existing 16 domains green: admin `POST /users` with a password still creates active users).

### Step D — Frontend

- [x] D1. Types, `parts.tsx` label, `globals.css` badge rule.
- [x] D2. `client.ts`, `api/auth.ts`, `api/school.ts` (constant removed, invite outcome, `resendInvite`, manager-safe `updateStudentProfile`).
- [x] D3. `permissions.ts` (`account.invite`), `services/people.ts`.
- [x] D4. `invite-hash.ts` (red-first `frontend/tests/invite-hash.test.ts`: accepts a valid hash, rejects missing prefix, too short, too long, bad characters, multiple params), `SetPasswordScreen.tsx`, `LuminaApp.tsx`, `LoginScreen.tsx`.
- [x] D5. `InviteForms.tsx` and the wiring in `AdminManagers.tsx`, `ManagerTeachers.tsx`, `ManagerStudents.tsx`.
- [x] D6. Extend `frontend/tests/permissions.test.ts` (includes the intentional asymmetry test: a student enrolled with a team teacher but carrying another manager's `managerId` -> frontend `false`, backend `true`): `account.invite` truth table (admin yes; manager own-team teacher/student yes; other manager no; teacher/student no); `teacher.create`/`student.create` unchanged; `setPersonStatus`-style guard not offered for invited rows is covered by e2e.
- [x] D7. Gate: typecheck (both), lint, frontend vitest, backend vitest (contract test imports `types.ts`).

### Step E — Tests, docs, exit gates

- [x] E1. `backend/scripts/smoke.ts`: new `invites` domain (`await scenario("invites", invitesScenario)` after `auth` at line ~1692) per the smoke matrix; make sure `cleanup()` (line 86) archives every user the domain creates (by the `smoke-{runId}-%` email prefix, best-effort try/catch, same pattern as the library cleanup block at line ~113); smoke fixtures stay in the dev DB by design.
- [x] E2. `backend/tests/contract.test.ts`: `app.hasRoute` for `POST /api/v1/users/:id/invite` and `POST /api/v1/auth/set-password`, anonymous `POST /auth/set-password` with an empty body answers 400 (not 401), anonymous `POST /users/:id/invite` answers 401, anonymous `POST /users` answers 401; collection keys still 18.
- [x] E3. `frontend/e2e/api/account-invites.spec.ts` (new) per the e2e matrix; update `frontend/e2e/api/import.spec.ts` (imported user is `invited`, cannot log in, no email); `frontend/e2e/demo/regression.spec.ts` (no invite UI, hash ignored, `apiCalls` stays `[]`).
- [x] E4. Code-adjacent docs (README, PROGRESS, CUTOVER_PLAN) per Blast Radius.
- [x] E5. Static gates: the literal-removal check and the logging grep (see Exit Gate).
- [x] E6. Run all exit gates and the regression list; write the high-risk evidence pack.

### Step F — HARD STOP: first real SMTP delivery (NOT executed by this plan)

- [ ] F1. After EXECUTE and EVL are green, the orchestrator reports status and asks the user: "Ready for the first real email? Name the recipient address." Nothing in Step F runs without that answer.
- [ ] F2. On approval only: with the user's real `backend/.env` (agents still do not read it), start the backend manually (`npm run start --workspace @lumina/backend`, `NODE_ENV=development`, `MAIL_MAILER=smtp`), create one `invited` test user whose email is the user's chosen address, ask the user to confirm the email arrived and the link opens the set-password screen, set a password, sign in, then archive that test user. Record the outcome in the phase report. No other recipient, no loop, no retries beyond one resend.
- [ ] F3. Until F2 completes, AC-19 stays CONDITIONAL and a backlog stub `account-invites-real-smtp-verification_NOTE_25-11-26.md` is written at UPDATE PROCESS (Known-Gap is never a PASS).

---

## Acceptance Criteria (REQ-TEST-LINK; each names its proving gate and strategy)

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | Migration `0007` is additive (enum value + `auth_tokens`), applies cleanly twice, `0005`/`0006` unchanged | `npm run db:migrate` x2 + SQL review checklist + `git status --porcelain -- backend/src/db` | Hybrid |
| AC-2 | Invite tokens are 256-bit, stored only as sha256, single-use, 72 h, conditional-consumed; unknown/expired/used give the same 400; two parallel accepts have one winner; a policy-invalid password does not burn the token | vitest `invites.test.ts` (pure parts) + smoke `invites` token checks | Fully-Automated (unit) + Hybrid (smoke) |
| AC-3 | Admin creates a user without a password: status `invited`, login fails with the generic 401, one mail captured with a working link and no password, set-password activates, refresh tokens revoked, then login works | smoke `invites` create/accept checks | Hybrid |
| AC-4 | Manager creates teacher/student on their own team atomically (profile `managerId` = the manager inside the same transaction; `managerOwns*` true at once; user visible in the manager bootstrap); manager cannot create admin/manager, send `password`, or name another `managerId` | smoke `invites` manager checks | Hybrid |
| AC-5 | Resend: admin any invited user, manager only own-team invited teacher/student (other team and non-invited rejected), old link dead after resend, cooldown 429, parallel resend leaves exactly one open token | smoke `invites` resend checks | Hybrid |
| AC-6 | Status safety: optional `password` is admin-only (manager 403) and yields an active user; PATCH `active`/`paused` on an invited user is 409; reset-password on an invited user is 409; email change expires open invites; archive expires open invites | smoke `invites` safety checks | Hybrid |
| AC-7 | Mailer behavior: `array`/`log`/`smtp` modes, `smtp` refused under `NODE_ENV=test`, SMTP option mapping, failure surfaces as `sent:false` with a generic error, link exposure truth table | vitest `mailer.test.ts` + `invites.test.ts` + smoke failure toggle (`failNext`) | Fully-Automated + Hybrid |
| AC-8 | Env: optional keys do not break existing `Env` literals; production refuses to start without smtp + host + from + `APP_URL` + encrypted transport and names the key; empty strings are unset | vitest `env-mail.test.ts` + existing `db-types.test.ts` | Fully-Automated |
| AC-9 | No secret leakage: invite email and responses carry no password; token/link/body/`MAIL_PASSWORD` never reach a logger call; client error text is fixed | vitest `invite-email.test.ts` + `mailer.test.ts` (log mailer) + the logging grep gate | Fully-Automated |
| AC-10 | Import creates users `invited` with unusable hashes, sends no mail, leaves adopted users alone; `DEFAULT_IMPORT_PASSWORD` is gone | vitest `school-import.test.ts` + e2e `import.spec.ts` + array-mailer outbox unchanged in smoke | Fully-Automated + Hybrid |
| AC-11 | The shared default literal is absent from `backend/src` (except the seed constant) and from `frontend/app` | the literal-removal grep gate (files-only output, literal never printed) | Fully-Automated |
| AC-12 | Seed refuses `NODE_ENV=production` before touching env or DB | vitest `seed-guard.test.ts` | Fully-Automated |
| AC-13 | Frontend parity: `account.invite` matches backend scope, hash parsing is strict, invited rows get Resend not Pause/Reset | vitest `permissions.test.ts` + `invite-hash.test.ts` + e2e (AC-14) | Fully-Automated + Hybrid |
| AC-14 | UI flow end to end: admin creates a teacher in the UI, sees the invite result and an Invited badge, opens the link, sets a password, hash cleared, signs in; manager creates a student and can resend; an invalid link shows the error | `frontend/e2e/api/account-invites.spec.ts` | Hybrid |
| AC-15 | Demo fence: no invite UI in demo mode, `#set-password` ignored, zero `/api/v1/` calls | `frontend/e2e/demo/regression.spec.ts` | Hybrid |
| AC-16 | No regression: Phase 02 uploads, Phase 03 auth lifecycle, Phase 04 library, Phase 05 rebook | vitest `auth-lifecycle.test.ts` + smoke `auth`/`uploads`/`library`/`rebook` domains + e2e `auth.spec.ts`/`uploads.spec.ts`/`curriculum-library.spec.ts` | Hybrid |
| AC-17 | Static soundness and a reproducible lockfile | `typecheck`, `lint`, `git diff --check`, then `npm ci` (no node processes running) followed by `typecheck` | Fully-Automated |
| AC-18 | New screens are usable at desktop and 390 px (set-password screen, invite result modal, invited badge + Resend, manager create form) | agent-probe screenshots (demo hides them, so API mode with the `log` mailer) | Agent-Probe |
| AC-20 | Transactional create/resend: a forced profile-insert failure leaves no `users` row and no token; set-password miss leaves the token unconsumed; invite -> archive -> PATCH active = 409; admin-only link exposure (manager responses never contain `link`) | vitest `invites.test.ts` (truth table, spy logger) + smoke `invites` rollback/manager/status checks | Fully-Automated + Hybrid |
| AC-19 | A real email arrives through the user's SMTP account and the link works | Step F (user-gated, NOT executed by EXECUTE) | Hybrid (manual, user-gated); until run: residual Known-Gap, CONDITIONAL, backlog stub |

Known-Gap residual: only the real-delivery sub-claim of AC-7/AC-19. It is not a proving strategy and the plan cannot be declared fully PASS until Step F runs; every other developed behavior is proven by Fully-Automated, Hybrid or Agent-Probe gates above.

---

## Test Plan (vc-test-coverage-plan; chain loaded: `process/context/tests/all-tests.md` is the whole test guide, no deeper test docs exist; existing blast-radius tests discovered: `backend/tests/{app,contract,password,auth-lifecycle,db-types,school-import}.test.ts`, `backend/scripts/smoke.ts`, `frontend/tests/permissions.test.ts`, `frontend/e2e/api/{auth,import}.spec.ts`, `frontend/e2e/demo/regression.spec.ts`)

Targets (>= current, exact totals recorded by EVL): backend vitest >= 12 files / >= 95 tests (now 7/61); frontend vitest >= 11 files / >= 62 tests (now 10/54); smoke >= 17 domains / >= 765 checks (now 16/705); e2e >= 29 API + 4 demo (now 27/4). Test runners are vitest (backend, frontend), the in-process smoke script, and Playwright.

### Fully-Automated stubs (red first; each scenario is written failing before the code exists)

```
Failing stub: test("should generate 32-byte base64url invite tokens", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: token generation") })
Failing stub: test("should build the invite link as base/#set-password=token and never use a request header", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: inviteLink / appBaseUrl") })
Failing stub: test("should refuse the smtp mailer under NODE_ENV=test", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: createMailer guard") })
Failing stub: test("should refuse to start in production without smtp, host, from address and APP_URL", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: env production guard") })
Failing stub: test("should return a link only for non-production log/array or admin on failure", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: shouldExposeInviteLink") })
Failing stub: test("should recognize an unusable password hash and never verify it", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: unusablePasswordHash") })
Failing stub: test("should refuse to seed when NODE_ENV is production", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: assertSeedAllowed") })
Failing stub: test("should accept only a well-formed #set-password hash", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: readSetPasswordToken") })
Failing stub: test("should create imported users invited with an unusable hash", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: buildImportPlan invited users") })
```

### Backend vitest file coverage

| File | Cases |
|---|---|
| `invites.test.ts` (new) | token shape/uniqueness; hash properties; expiry 72 h; link builder; base URL precedence; cooldown math; link-exposure truth table (production/dev x smtp/log/array x sent/failed x admin/manager) |
| `mailer.test.ts` (new) | array store/clear/`failNext`; log mailer output has no body, link or token and masks the recipient; `createMailer` refusal under test; `buildSmtpOptions` for ssl/tls/none, credential and timeout mapping; no network |
| `invite-email.test.ts` (new) | subject fixed; link and expiry present; name escaped; no password text; plain and HTML parts both carry the link |
| `env-mail.test.ts` (new) | optional/empty handling; production guard per key; encryption rules; defaults resolve in code not in zod |
| `seed-guard.test.ts` (new) | production throws; development/test/undefined pass |
| `password.test.ts` (extend) | unusable-hash helpers |
| `school-import.test.ts` (extend) | invited users, warning, adopted untouched, option removed |
| `contract.test.ts` (extend) | routes exist; anonymous behavior; 18 keys |

### Smoke `invites` domain matrix (`backend/scripts/smoke.ts`; fixtures use unique `smoke-{runId}-inv*` emails; array mailer injected; `INVITE_RESEND_COOLDOWN_SECONDS=2`, so each legitimate resend is preceded by a 2.1 s wait)

1. Admin create, invited path: `POST /users` without `password` -> 201, `status: "invited"`, `invite.mode: "array"`, `invite.sent: true`, `invite.link` present (non-production array); exactly one outbox message to that address; the message text contains the link and not the word of any password; login with a guessed password -> 401 `Invalid email or password`; `/auth/refresh` impossible; the user is in the admin bootstrap with status `invited`.
2. Accept: token extracted from the outbox link; `POST /auth/set-password` with a 9-character password -> 400 `VALIDATION_ERROR` and the token still works; with a valid password -> 204; login -> 200; status `active`; a second use of the same token -> generic 400; one `user.invite_accepted` activity row; the user's refresh-token rows were revoked at accept (none active before login).
3. Token edge cases: unknown token, a token for an expired row (fixture: direct `UPDATE auth_tokens SET expires_at = now() - interval '1 minute'` for that hash), a used token and a token of an archived invitee all -> identical 400 body; `Promise.all` of two accepts of one fresh token -> exactly one 204 + one 400, never 500.
4. Resend: admin resend -> 200, new outbox message, the first link now 400; immediate second resend -> 429; `Promise.all` of two resends (after waiting) -> one 200 + one 429, and the DB shows exactly one open (unused, unexpired) invite token for that user; resend for an active user -> 409; unknown id as admin -> 404; one `user.invite_resent` row per success.
5. Manager creation: manager A `POST /users` role `teacher` -> 201 invited; the teacher profile's `managerId` equals A, `managerOwnsTeacher` true immediately (A can `PATCH /teachers/:id` headline -> 200), A's bootstrap contains the user; role `student` likewise; role `admin` and role `manager` -> 403; body with `password` -> 403; body with `managerId` of manager B -> 403; body with `managerId` of A -> 201; manager B cannot see or PATCH A's new teacher (403).
6. Manager resend: A on own invited teacher -> 200; A on manager B's invited student -> 403; A on an invited manager/admin target -> 403; teacher and student tokens -> 403; manager create/resend responses NEVER contain `link`, on success or `failNext`, for every mailer kind (S11, user decision 25-11-26); the manager reads the new link from the array outbox only. For an admin the same failure includes `link`, and admin + `smtp`-kind + sent excludes it (covered by the `shouldExposeInviteLink` unit truth table).
7. Admin-only password: admin `POST /users` with a password -> 201 `active`, no outbox message, login works; manager with a password -> 403 (covered in 5).
8. Status safety: admin `PATCH` `{status:"active"}` and `{status:"paused"}` on an invited user -> 409 `ACCOUNT_NOT_ACTIVATED`; `reset-password` on an invited user -> 409; `PATCH` email on an invited user then the old link -> 400; archive an invited user then its link -> 400 and archived status stays; `GET /users?status=invited` filters.
9. Mail failure: with `failNext` the create still returns 201 `invited`, `invite.sent:false`, generic error text (never contains SMTP wording), user and token exist, a following resend succeeds.
10. Import: `POST /school/import` (admin) of a one-user synthetic payload creates the user `invited` with no outbox growth and an unusable hash; that user cannot log in; the admin resend sends one mail (reuses the same fixture style as `import.spec.ts`; if the synthetic payload cost is high, this item is proven by `school-import.test.ts` + e2e `import.spec.ts` and recorded as such).
11. Regression-sensitive: existing `createUser` helper (smoke.ts:245) with a password still yields an active, login-capable user for every other domain; the guessed-password login check in domain `auth` is unchanged.

### E2E matrix (`frontend/e2e/api/account-invites.spec.ts`; backend runs with the `log` mailer and cooldown 0; hygiene: unique `runId` emails, `archiveUser` in `finally`)

- Test 1 (admin UI path): admin signs in, adds a teacher in Teachers (no password field), the invite result modal shows the copyable link (`invite-link`), the row shows an "Invited" badge and "Resend invite" (no Pause, no Reset password); a new browser context opens the link; the fragment is gone from the URL after submit; a mismatched confirm shows a client error; a short password shows the policy error and the same link still works; a valid password shows `set-password-success`; Continue to sign in, the new teacher signs in with that password and sees the teacher workspace; the old link now shows the invalid/expired message.
- Test 2 (manager UI path, user decision 25-11-26): manager signs in, adds a student in Students, sees the Invited badge, presses Resend (200), and asserts there is NO `invite-link` element and no password field anywhere in the manager UI; link invalidation after resend is proven by smoke/admin checks (the manager never sees a link); `archiveUser` in `finally`.
- Demo regression (`regression.spec.ts`): no "Resend invite" control, no invite modal, the `#set-password=...` hash is left untouched in the URL, loading `/#set-password=<valid-looking token>` renders the normal demo login, `apiCalls` equals `[]`.
- `import.spec.ts`: after import the created student is `invited` and `POST /auth/login` for the imported user's email returns 401 (asserted explicitly, S16).

### Regression list (EVL reruns)

Phase 03: vitest `auth-lifecycle.test.ts`, smoke `auth`, e2e `auth.spec.ts`. Phase 02/04: smoke `uploads`, `library`, e2e `uploads.spec.ts`, `curriculum-library.spec.ts`. Phase 05: smoke `rebook`, frontend vitest suite. Import: `school-import.test.ts`, `import.spec.ts`. All existing 705 smoke checks stay green.

### Gap resolution (vc-test-coverage-plan format)

| Gap | Resolution options |
|---|---|
| Real SMTP delivery and rendering in a real mail client | A) Step F manual send after explicit user OK (chosen, user-gated). B) Local MailHog/SMTP sink in Phase 06 compose. C) Accept as known-gap (never as PASS). D) Backlog stub `account-invites-real-smtp-verification_NOTE_25-11-26.md` (written at UPDATE PROCESS). |
| Frontend component rendering of `SetPasswordScreen` / `InviteResultModal` | A) e2e covers behavior (chosen). B) component test runner (none exists). C) accept. D) existing backlog theme "no frontend component tests". |
| Token-consume SQL needs a database | A) smoke `invites` (chosen, local Postgres). B) disposable test DB (Phase 06). C) accept. D) existing backlog `smoke-ci-and-fixtures`. |

---

## Exit Gate

```powershell
npm run db:migrate                         # applies 0007 once, then a no-op
npm run typecheck
npm run lint
npm run test --workspace @lumina/backend
npm run test --workspace @lumina/frontend
npm run smoke                              # array mailer only; 17 domains
# pre-e2e port check (literal, Hard Stop 4): `netstat -ano | findstr ":3000 :3100 :4000"` must print nothing (listening); else STOP and ask
npm run e2e                                # log mailer only
git diff --check
git status --porcelain -- backend/src/db   # only schema.ts, 0007_*.sql, meta/0007_snapshot.json, meta/_journal.json
# literal-removal gate (S12; files only; the literal is never printed). Pin the source commit c6d2e19, NOT HEAD. Via the Bash tool write the pattern to a scratch file: git show c6d2e19:frontend/app/lib/school/api/school.ts | sed -n 's/.*DEFAULT_ACCOUNT_PASSWORD = "\(.*\)";/\1/p' | tr -d '\r' > <scratch>/pattern.txt ; assert the file is NON-EMPTY (test -s); never cat/print it; then run:
git grep -l -F -f <scratch>/pattern.txt -- frontend/app backend/src   # expect ONLY backend/src/db/seed.ts
# out of scope (test fixtures keep their own literal): frontend/e2e/support/api.ts, backend/tests/contract.test.ts, backend/tests/password.test.ts
# logging gate (S14): first baseline the existing matches in auth.ts and users.ts at the pinned commit c6d2e19 (run the grep against `git show c6d2e19:<file>`), then require NO NEW matches beyond that baseline; plus spy-logger vitest assertions (in `invites.test.ts` and `mailer.test.ts`) that `deliverInvite` and the log mailer emit captured logs containing no token, link or body
git grep -nE "(log|logger)\.(info|warn|error|debug)\([^)]*(token|link|html|text|MAIL_PASSWORD)" -- backend/src/lib/invites.ts backend/src/lib/mailer.ts backend/src/lib/invite-email.ts backend/src/routes/users.ts backend/src/routes/auth.ts   # expect no output
# lockfile gate (no node processes running): npm ci, then npm run typecheck
# Expected counts are MINIMUMS (>= current): backend vitest >= 12 files / >= 95 tests; frontend vitest >= 11 / >= 62; smoke >= 17 domains / >= 765 checks; e2e >= 29 API + 4 demo; EVL records the exact counts. Do NOT change the smoke `createUser` or e2e `createDisposableUser` helpers.
```

- All checklist items A-E checked; Step F not executed and reported as the pending hard stop.
- Phase 03 auth and Phase 02/04 regression confirmed green; high-risk evidence pack written in `harness/account-invites/`.
- Report written to the report destination above.

---

## Blockers That Would Justify BLOCKED Status

- `npm run db:migrate` fails or the generated `0007` SQL contains anything destructive or touches existing tables beyond the enum value.
- `nodemailer` install changes anything in `package-lock.json` beyond itself and its types, or `npm ci` fails.
- The existing 16 smoke domains cannot stay green after Step C (for example admin `POST /users` with a password regresses).
- A port 4000 listener exists before `npm run e2e` (Hard Stop 4) and the user has not cleared it.
- Any step would require reading `backend/.env`, printing a secret, or sending real mail.

---

## Rollback

Code: revert the uncommitted execution changes (everything lands in one execution commit on `developing`). Database: `0007` is additive and forward-only: the enum value stays; to retire the feature leave the table unused or drop `auth_tokens` in a later migration; never delete an applied migration file. Users created `invited` before a code revert would be unable to sign in until an admin runs `POST /users/:id/reset-password` on a build that still allows it for `invited` users, so revert only together with a decision about open invitations. Dependency: removing `nodemailer` requires removing `lib/mailer.ts` consumers first.

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step loop is `R -> I -> P -> PVL -> E -> EVL -> UP`; the outer SPEC step was skipped by user decision for this fix.

- [x] 0. SPEC — skipped by user decision (24-11-26/25-11-26): the six user decisions listed in the task are the locked requirements
- [x] 1. RESEARCH — 25-11-26: research-agent inspected the default-password flow (frontend `api/school.ts`, `school-import.ts`, seed), the auth lifecycle (Phase 03), schema, env, test harness and Playwright env inheritance
- [x] 2. INNOVATE — 25-11-26: innovate-agent chose invited status + `auth_tokens` + SMTP mailer + frontend set-password screen; user overrode "hide create for managers" (managers create team teachers/students) and set the 72 h expiry, no email in import, admin-only optional password, seed guard
- [x] 3. PLAN — 25-11-26: this plan written; deviations from INNOVATE recorded in Locked Decisions (D2 unusable-hash marker, D9 `mode` field and admin link on failure, D11 URL fragment instead of query parameter)
- [x] 4. PVL — 25-11-26: validate-contract written, Gate: PASS (cycle 1 supplement S1-S17 verified; outer-pvl)
- [x] 5. EXECUTE — 25-11-26: Steps A-E done, all exit gates green (see account-invites_REPORT_25-11-26.md); Step F not executed (user-gated hard stop)
- [x] 6. EVL — 26-11-26: independent vc-tester confirmed all gates twice (before and after review fix cycle 1); see account-invites-evl-iteration-001_REPORT_25-11-26.md
- [x] 7. UPDATE PROCESS — 26-11-26: report, context docs, backlog notes, registry, umbrella state, review-decision.json done; committed; NOT archived (Step F pending user)

**Validate-contract required before execute.** If step 4 is unchecked or `## Validate Contract` reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", the orchestrator must spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent instructions / Test gates is treated as a placeholder.

---

## Touchpoints

- `backend/src/db/{schema.ts,seed.ts,seed-guard.ts,migrations/0007_*.sql,migrations/meta/*}`
- `backend/src/{app.ts,config/env.ts,types/fastify.d.ts}`
- `backend/src/lib/{tokens,invites,invite-email,mailer,password,activity,school-import}.ts`
- `backend/src/routes/{users,auth,teachers,students,school-import}.ts`
- `backend/package.json`, `package-lock.json`
- `backend/tests/{invites,mailer,invite-email,env-mail,seed-guard,password,school-import,contract}.test.ts`, `backend/scripts/smoke.ts`
- `frontend/app/lib/{auth/invite-hash,api/types,api/client,api/auth}.ts`, `frontend/app/lib/school/{types,permissions,notifications}.ts`, `frontend/app/lib/school/api/school.ts`, `frontend/app/lib/school/services/people.ts`
- `frontend/app/components/{LuminaApp,LoginScreen,SetPasswordScreen}.tsx`, `frontend/app/components/manager/{parts,InviteForms,ManagerTeachers,ManagerStudents}.tsx`, `frontend/app/components/admin/AdminManagers.tsx`, `frontend/app/globals.css`
- `frontend/tests/{invite-hash,permissions}.test.ts`, `frontend/e2e/api/{account-invites,import}.spec.ts`, `frontend/e2e/demo/regression.spec.ts`, `frontend/playwright.config.ts`
- `README.md`, `frontend/PROGRESS.md`, `frontend/CUTOVER_PLAN.md`

---

## Public Contracts

- New endpoints: `POST /api/v1/users/:id/invite` (200 `{ invite }`; 403/404/409/429 per table) and public `POST /api/v1/auth/set-password` (204; generic 400 `INVALID_OR_EXPIRED_TOKEN`).
- Changed endpoint: `POST /api/v1/users` is now `admin` or `manager`; `password` is optional and admin-only; without a password the response is 201 with the user (`status: "invited"`) plus `invite: { sent, mode, error?, link? }`; manager-created teachers/students carry the manager as `managerId` atomically.
- New error codes: `INVALID_OR_EXPIRED_TOKEN` (400), `ACCOUNT_NOT_ACTIVATED` (409); reuse of `RATE_LIMITED` (429) and `CONFLICT` (409).
- Status enum: `user_status` gains `invited` (users list/teacher/student filters accept it; `/auth/me` can never return it; PATCH cannot set it).
- Bootstrap: unchanged keys (18), `SCHOOL_SCHEMA_VERSION` 3; `users[].status` may now be `invited`.
- Env contract: 10 new optional keys (D12); production startup requirements; `MAIL_*` names kept as already present in `backend/.env`.
- Import: new users are `invited`; `defaultPasswordHash` removed from `buildImportPlan` options.
- Internal seam: `buildApp({ env, mailer? })`, `app.mailer`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `npm run db:migrate` x2 + `0007` SQL review + `git status --porcelain -- backend/src/db` | Hybrid | AC-1 |
| vitest `invites.test.ts` + smoke `invites` token/accept/edge checks | Fully-Automated + Hybrid | AC-2, AC-3 |
| smoke `invites` manager creation checks | Hybrid | AC-4 |
| smoke `invites` resend + cooldown + parallel checks | Hybrid | AC-5 |
| smoke `invites` status-safety and admin-only-password checks | Hybrid | AC-6 |
| vitest `mailer.test.ts` + smoke failure toggle | Fully-Automated + Hybrid | AC-7 |
| vitest `env-mail.test.ts` + `db-types.test.ts` | Fully-Automated | AC-8 |
| vitest `invite-email.test.ts` + logging grep gate | Fully-Automated | AC-9 |
| vitest `school-import.test.ts` + e2e `import.spec.ts` | Fully-Automated + Hybrid | AC-10 |
| literal-removal grep gate | Fully-Automated | AC-11 |
| vitest `seed-guard.test.ts` | Fully-Automated | AC-12 |
| frontend vitest `permissions.test.ts` + `invite-hash.test.ts` | Fully-Automated | AC-13 |
| `frontend/e2e/api/account-invites.spec.ts` | Hybrid | AC-13, AC-14 |
| `frontend/e2e/demo/regression.spec.ts` | Hybrid | AC-15 |
| Regression list (auth-lifecycle, smoke auth/uploads/library/rebook, e2e auth/uploads/curriculum-library) | Hybrid | AC-16 |
| `typecheck`, `lint`, `git diff --check`, `npm ci` then `typecheck` | Fully-Automated | AC-17 |
| Screenshot review at desktop and 390 px (API mode, log mailer) | Agent-Probe | AC-18 |
| Step F real SMTP send (user-gated, not executed) | Hybrid (manual) — residual Known-Gap until run | AC-19 |
| vitest `invites.test.ts` (link truth table, spy logger) + smoke `invites` rollback, manager-no-link and status-safety checks | Fully-Automated + Hybrid | AC-20 |

High-risk classes present (auth/identity, schema/migration, public API contract, secrets/trust boundary): minimum Hybrid; the only Known-Gap is real delivery (AC-19), kept CONDITIONAL with a backlog stub, never counted as PASS.

---

## Test Infra Improvement Notes

- `backend/scripts/smoke.ts` is a shared surface (Phases 04/05/06); keep the `invites` domain self-contained with its own fixtures and cleanup.
- Smoke needs a sleep helper for the resend cooldown; if more time-based rules appear, inject a clock into `invites.ts` instead of sleeping (candidate backlog).
- Playwright's `reuseExistingServer: !process.env.CI` can silently reuse a developer backend running in `smtp` mode; Phase 06 should make the API config refuse an existing backend or assert `MAIL_MAILER=log` through a health detail.
- A disposable test database and a local SMTP sink (MailHog) in the Phase 06 compose file would remove the Known-Gap on real delivery rendering.
- `backend/.env.example` cannot be read or edited by agents; the user adds `APP_URL` and `INVITE_RESEND_COOLDOWN_SECONDS` there (Open Item 1).

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/launch-readiness/active/account-invites_25-11-26/account-invites_PLAN_25-11-26.md`
- Last completed step: Step 3 PLAN (25-11-26); Steps 0-2 recorded in Phase Loop Progress
- Validate-contract status: written 25-11-26, Gate: PASS (outer-pvl)
- Supporting context files loaded: `process/context/{all-context,tests/all-tests,auth/{jwt-cookie-flow,roles-and-scope}}.md`; backlog notes `default-account-password`; umbrella plan; Phase 04 plan (format); `phase-blast-radius-registry.md`; code anchors verified 25-11-26: `users.ts:41-55,160-210,212-313,315-354,356-379`, `auth.ts:75-77,92-122,175-262`, `env.ts:12-58`, `app.ts:17-37,120-121`, `schema.ts:25-29,103-118`, `password.ts:14-17,71-86`, `school-import.ts:47,392,425,521-535`, `routes/school-import.ts:8,53,67-76`, `seed.ts:5,28`, `reset.ts:28`, `teachers.ts:171-173`, `students.ts:193-194`, `api/school.ts:18,52-57,81-94,116-143`, `client.ts:99-105`, `people.ts:74-97,112-147,209-246,323-337`, `permissions.ts:10-39,89-99`, `parts.tsx:15`, `playwright.config.ts:44-46`, `smoke.ts:60-69,86,245,1662,1677-1692`
- Next step: spawn vc-validate-agent (sonnet; parallel Layer-1 dimension agents) for PVL; after Gate: PASS the orchestrator emits the /goal block and spawns vc-execute-agent (opus, sequential) for Steps A-E; Step F is never executed without the user's explicit answer.

### Open Items for the user (not blockers for PLAN/PVL)

1. `backend/.env.example` and `backend/.env`: agents cannot read them. Please add `APP_URL` (dev default `http://localhost:3000` works without it) and `INVITE_RESEND_COOLDOWN_SECONDS` (optional) to the example file, and tell us the `MAIL_ENCRYPTION` style in use (`ssl` with port 465 or `tls` with port 587) only if it differs from the mapping in D12.
2. Phase 06 must supply the production mail keys and `APP_URL` in `docker-compose.yml`/README and must not run `db:seed` in a production container (the seed guard refuses). Registry addendum records this.
3. There is no first-admin path in production once the seed is guarded. Proposed follow-up (backlog stub `production-first-admin-bootstrap_NOTE_25-11-26.md`, written in C6; decided with Phase 06): a one-off CLI that creates the first admin as `invited` and prints nothing secret.

### UPDATE PROCESS list (for vc-update-process-agent)

- Backlog: mark `default-account-password_NOTE_24-11-26.md` RESOLVED and move it with the report; update `admin-password-recovery_NOTE_24-11-26.md` (the `auth_tokens` table now leaves room for `reset`), `access-token-revocation_NOTE_24-11-26.md` (set-password revokes refresh only, unchanged window), `refresh-and-password-change-atomicity_NOTE_24-11-26.md` (set-password is one transaction), `trust-proxy-and-limiter-store_NOTE_24-11-26.md` (link base never from headers; set-password limited by IP).
- New backlog stubs: `account-invites-real-smtp-verification_NOTE_25-11-26.md` (`production-first-admin-bootstrap_NOTE_25-11-26.md` is written earlier, in C6), `reinvite-archived-account_NOTE_25-11-26.md`, `manager-patch-team-member-email_NOTE_25-11-26.md` (users.ts:221 blocks managers from PATCHing team users, so the team-member status branch at 228-238 is unreachable), `bulk-invite-send_NOTE_25-11-26.md`, `invite-clock-injection_NOTE_25-11-26.md`.
- Context docs listed under Blast Radius; the `all-context.md` Care Areas "Auth lifecycle" paragraph loses the HIGH default-password item; env names list gains the 10 keys; test counts updated from the EVL run.
- Registry: set this fix's status in `phase-blast-radius-registry.md` and keep the Phase 06 overlap note; add the Phase 06 prerequisite: backlog stub `production-first-admin-bootstrap_NOTE_25-11-26.md` (MEDIUM, blocks a real production deploy) must be resolved or accepted before Phase 06 ships production.

---

## PVL cycle 1 supplement (25-11-26)

Applied from the V7 SUPPLEMENT REQUEST (17 gaps, no FAILs; plan file only). User decision 25-11-26: link exposure is admin-only in every mode, managers never receive a link (T1, OPTION A).

- S1 -> A2: 0007 never references 'invited'; exact ALTER TYPE line recorded; PG 17 / PG>=12 note.
- S2 -> D12, B2: separate superRefine block, shared emptyToUndefined, coerce numbers (cooldown nonnegative so `0` parses; explicit deviation), MAIL_PORT wins, typecheck before tests.
- S3 -> B4: Playwright backend env sets NODE_ENV development, MAIL_MAILER log, cooldown 0; dotenv no-override confirmed at backend/src/index.ts:1; smoke asserts NODE_ENV test and array mailer.
- S4 -> D15, C6, UPDATE PROCESS list: guard placed before `const env = loadEnv();` (verified at seed.ts:24, not 14); backlog stub production-first-admin-bootstrap_NOTE_25-11-26.md (MEDIUM) and Phase 06 prerequisite.
- S5 -> B1: single `npm ci` and lockfile diff check.
- S6 -> routes table, C1, AC-20, STRIDE: one transaction for create/resend, 409 inside tx, mail after commit, rollback test.
- S7 -> D4, routes table, C2: lock, ownership from tx, cooldown from max(created_at), expire, insert.
- S8 -> D5, routes table, C4: set-password order and rollback leaving the token unconsumed.
- S9 -> D8, C3: isUnusablePasswordHash checks on all reactivation paths; expireOpenInvites on archive/pause; archive-then-PATCH and old-token tests.
- S10 -> STRIDE: enumeration accepted, limiter inherits trustProxy gap, never log token/link/body.
- S11 -> D9, Frontend UI, smoke item 6, e2e Test 2, Public Contracts via D9: admin-only link; manager e2e asserts Invited badge, Resend 200, no invite-link element.
- S12 -> Exit Gate: pinned c6d2e19, scratch pattern file via tr -d CR, non-empty assertion, never printed; test fixtures out of scope.
- S13 -> D11, e2e demo regression: mount read into state, clear on submit, hashchange listener, token check before session bootstrap, StrictMode-safe; demo leaves hash untouched.
- S14 -> Exit Gate: baseline at c6d2e19 and no-new-matches; spy-logger assertions.
- S15 -> D16, permissions bullet, D6: setPersonStatus narrowing in the same commit; asymmetry test.
- S16 -> C5, import.spec: defaultPasswordHash args removed at school-import.test.ts:94,457 in the C5 step; login 401 assertion.
- S17 -> Exit Gate: literal port check for 3000/3100/4000; counts are minimums, EVL records exact; helpers unchanged.

## Validate Contract

Status: PASS (PVL cycle 1 supplement S1-S17 verified; 0 FAIL, 0 open CONCERN)
Date: 25-11-26
date: 2026-11-25
generated-by: outer-pvl
supersedes: none (first contract in this plan; the placeholder was replaced)

Parallel strategy: sequential (EXECUTE: one opus vc-execute-agent for Steps A-E); read-only reviewers and the EVL vc-tester run on sonnet
Rationale: signals S1 (two workspaces), S2 (auth/schema/API), S6 (high-risk classes) and S7 (5+ files) are present = 4/7 HIGH, but the work is a strictly ordered dependency chain (schema -> primitives -> mailer/env/harness guards -> routes -> frontend -> tests) with shared files (`smoke.ts`, `users.ts`, `people.ts`) and one migration; no mid-run coordination channel adds value, so sequential execution beats a team or fan-out.

### Plan updates applied

- (V1) `validate-plan-artifact.mjs` run on this plan after the contract write (result recorded in the V7 handoff).
- (V3) Verified S1-S17 against the plan text and the live code anchors: seed.ts line 24 is `const env = loadEnv();` and line 1 is `import "dotenv/config"`; env.ts `superRefine` has the CORS early `return`; `frontend/playwright.config.ts` webServer `env` is currently only `{ RATE_LIMIT_MAX, AUTH_RATE_LIMIT_MAX }`, so B4 is a real addition; smoke.ts `loadEnv` already sets `NODE_ENV: "test"`; `buildApp({ env })` is at smoke.ts:1662. All 17 supplements are present and mutually consistent (D9 admin-only link agrees with the routes table, STRIDE, risk table, smoke item 6, e2e Test 2, the frontend InviteResultModal and Public Contracts).
- (P1) The seed-guard module row said `seed.ts:5`; corrected to `const env = loadEnv();` (seed.ts:24; line 5 is only the import). Matches D15, C6, S4.
- (P2) The first-admin backlog stub had two names (`first-admin-bootstrap_...` vs `production-first-admin-bootstrap_...`). Canonical name is `production-first-admin-bootstrap_NOTE_25-11-26.md` everywhere (Open Item 3 and the UPDATE PROCESS list fixed).

### Deviation judgments (the three flagged by the orchestrator)

1. seed.ts line 24 instead of 14: ACCEPTED. Verified in the file: the imports end before line 24, `const env = loadEnv();` is line 24, `DEMO_PASSWORD` is line 28. The guard sits before that statement; the exact line number is irrelevant to EXECUTE.
2. `INVITE_RESEND_COOLDOWN_SECONDS` `.nonnegative()` instead of `.positive()`: ACCEPTED, and `.positive()` would have been a defect. The e2e backend is configured with `"0"` (B4, D4), and `loadEnv` would throw at startup with `.positive()`, so Playwright could never boot. `0` disables the cooldown (`cooldownRemainingSeconds` returns 0), intended for e2e only; the default stays 30. Add one `env-mail.test.ts` case: `"0"` parses, `"-1"` fails.
3. Registry addendum deferred to UPDATE PROCESS: ACCEPTED. The section "Pre-06 account-invites (addendum 25-11-26)" already exists in `phase-blast-radius-registry.md` (uncommitted, written at PLAN), so the overlaps and Phase 06 obligations are on record before EXECUTE. Only the status change and the Phase 06 prerequisite link to the first-admin stub remain, and those are UPDATE PROCESS items by design. EXECUTE must NOT edit the registry.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Run Step B4 (Playwright backend env `NODE_ENV=development`, `MAIL_MAILER=log`, `INVITE_RESEND_COOLDOWN_SECONDS=0`; smoke `MAIL_MAILER=array`, cooldown `2`, array mailer injection, start-up assertions) BEFORE any smoke or e2e run. | Step B |
| E2 | Never read `backend/.env` or its example file; never print `MAIL_PASSWORD`, `JWT_SECRET`, tokens, invite links or the old default literal (grep gates print file names only). Ask the user for any value you think you need. | Always |
| E3 | Migration `0007`: generate, read the SQL, confirm it never references `'invited'` outside the single `ALTER TYPE ... ADD VALUE`; apply twice; run only `npm run db:migrate` against dev `lumina`. Never `db:push`, `db:reset`, TRUNCATE, or hand-edit the journal/snapshot. If the SQL touches anything else: STOP (BLOCKED). | Step A2 |
| E4 | Before writing `env-mail.test.ts`, run `npm run typecheck` to confirm the inferred `Env` keeps the 10 new keys optional so the typed `Env` literals in `backend/tests/{app,contract,auth-lifecycle}.test.ts` still compile. Add a `"0"` / `"-1"` cooldown case. | Step B2 |
| E5 | `nodemailer` install: re-verify versions with `npm view`, install, then `npm ci` ONCE with no node processes running; the lockfile diff must be only `nodemailer` and `@types/nodemailer`. Anything else: STOP. | Step B1 |
| E6 | `assertSeedAllowed(process.env.NODE_ENV)` is the first statement after the imports in `seed.ts`, before `const env = loadEnv();`. In C6 write only the backlog stub `production-first-admin-bootstrap_NOTE_25-11-26.md`; do NOT edit `phase-blast-radius-registry.md` (UPDATE PROCESS owns it). | Step C6 |
| E7 | Link exposure is ADMIN-ONLY in every mode (D9). A manager response to create/resend must never contain `link`, on success or on a forced mail failure. Implement `shouldExposeInviteLink` exactly as the truth table; cover manager/admin x production/dev x smtp/log/array x sent/failed in `invites.test.ts`. | Steps A5, C1, C2 |
| E8 | One transaction per create/resend/accept in the exact orders D4/D5 (row lock first; ownership read from the same tx; cooldown from `max(created_at)`; conditional token UPDATE; `UPDATE users ... WHERE status='invited'` requiring one row). A miss rolls back and leaves the token unconsumed. Mail only after commit, never inside the transaction. | Steps C1, C2, C4 |
| E9 | TDD: every Fully-Automated scenario starts as the failing stub listed below, then goes green. Do not change the smoke `createUser` helper or the e2e `createDisposableUser` helper. | Steps A-E |
| E10 | Before `npm run e2e`: `netstat -ano \| findstr ":3000 :3100 :4000"` must show no listener, otherwise STOP and ask the user (a reused backend on 4000 could be in `smtp` mode). | Step E gate |
| E11 | Literal-removal gate: build the pattern from `git show c6d2e19:frontend/app/lib/school/api/school.ts` into a scratch file via `tr -d '\r'`, assert `test -s`, never print it; `git grep -l -F -f` must list only `backend/src/db/seed.ts`. | Step E5 |
| E12 | Smoke `invites` domain: wait 2.1 s before every legitimate resend; `cleanup()` archives all `smoke-{runId}-%` users (best-effort). Counts are minimums; the EVL records exact totals. | Step E1 |
| E13 | Write the 5-artifact high-risk pack in `process/features/launch-readiness/active/account-invites_25-11-26/harness/account-invites/` (shape of `lumina-v1-finish_23-11-26/harness/phase-03-auth/`); `review-decision.json` is completed at UPDATE PROCESS; `mustStopBeforeFinalize` stays true until Step F is decided. | Step E6 |
| E14 | Step F (real SMTP send) is a HARD STOP outside EXECUTE. Stop after E6, report status, and ask: "Ready for the first real email? Name the recipient address." No real send without that answer. | End of EXECUTE |
| E15 | Docs edited in EXECUTE are code-adjacent only (`README.md`, `frontend/PROGRESS.md`, `frontend/CUTOVER_PLAN.md`); context docs under `process/context/` are UPDATE PROCESS work. | Step E4 |

### Test gates

The strategy column carries only the three proving strategies; Known-Gap is a residual row via gap-resolution D. Gap-resolution legend: A proven now, B fixed in this plan (gate added by this plan's checklist), C deferred to a named later plan, D backlog test-building stub.

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Migration `0007` additive, applies twice, `0005`/`0006` unchanged | Hybrid | `npm run db:migrate` x2 (needs local Postgres + backend env file) + SQL checklist + `git status --porcelain -- backend/src/db` | B |
| AC-2a | Token shape, hash properties, 72 h expiry, link builder, cooldown math | Fully-Automated | `npm run test --workspace @lumina/backend` (`invites.test.ts`) | B |
| AC-2b | Single-use conditional consume; parallel accept = one 204 + one 400; policy-invalid password does not burn the token | Hybrid | `npm run smoke` (`invites` token/accept/edge checks; local Postgres) | B |
| AC-3 | Admin create invited -> mail -> set-password -> login | Hybrid | `npm run smoke` (`invites` items 1-2) | B |
| AC-4 | Manager creates own-team teacher/student atomically; cannot create admin/manager, send `password`, or name another `managerId` | Hybrid | `npm run smoke` (`invites` item 5) | B |
| AC-5 | Resend rules, old link dead, cooldown 429, parallel resend leaves one open token | Hybrid | `npm run smoke` (`invites` items 4, 6) | B |
| AC-6 | Status safety (PATCH 409, reset 409, email change and archive expire tokens, admin-only password) | Hybrid | `npm run smoke` (`invites` items 7-8) | B |
| AC-7a | Mailer modes, smtp refused under test, option mapping, no network | Fully-Automated | `npm run test --workspace @lumina/backend` (`mailer.test.ts`, `invites.test.ts` truth table) | B |
| AC-7b | Mail failure surfaces `sent:false` with the fixed generic error | Hybrid | `npm run smoke` (`invites` item 9, `failNext`) | B |
| AC-8 | Env optional keys, production guard names each key, empty = unset, cooldown `"0"` parses | Fully-Automated | `npm run test --workspace @lumina/backend` (`env-mail.test.ts`, `db-types.test.ts`) | B |
| AC-9 | No password in email/responses; token, link, body, `MAIL_PASSWORD` never logged | Fully-Automated | vitest `invite-email.test.ts` + `mailer.test.ts` (spy logger) + the logging `git grep -nE` gate from the Exit Gate (no new matches vs the `c6d2e19` baseline) | B |
| AC-10a | Import makes invited users with unusable hashes, adopted users untouched, option removed | Fully-Automated | `npm run test --workspace @lumina/backend` (`school-import.test.ts`) | B |
| AC-10b | Import sends no mail; imported user cannot log in (401) | Hybrid | `npm run e2e` (`import.spec.ts`) + smoke outbox unchanged | B |
| AC-11 | Shared default literal absent except the seed | Fully-Automated | pinned `git grep -l -F -f <scratch>/pattern.txt -- frontend/app backend/src` expects only `backend/src/db/seed.ts` | B |
| AC-12 | Seed refuses production before touching env/DB | Fully-Automated | `npm run test --workspace @lumina/backend` (`seed-guard.test.ts`) | B |
| AC-13a | `account.invite` parity and strict hash parsing | Fully-Automated | `npm run test --workspace @lumina/frontend` (`permissions.test.ts`, `invite-hash.test.ts`) | B |
| AC-13b / AC-14 | UI flow: admin invite + set-password + login; manager resend with no link element; invalid link message | Hybrid | `npm run e2e` (`frontend/e2e/api/account-invites.spec.ts`; ports 3000/3100/4000 free) | B |
| AC-15 | Demo fence: no invite UI, hash ignored, zero `/api/v1/` calls | Hybrid | `npm run e2e` (`frontend/e2e/demo/regression.spec.ts`) | B |
| AC-16 | No regression in Phases 02-05 | Hybrid | vitest `auth-lifecycle.test.ts` + `npm run smoke` (`auth`, `uploads`, `library`, `rebook`) + `npm run e2e` (`auth`, `uploads`, `curriculum-library`) | A |
| AC-17 | Static soundness, reproducible lockfile | Fully-Automated | `npm run typecheck`, `npm run lint`, `git diff --check`, then `npm ci` followed by `npm run typecheck` | A |
| AC-18 | New screens usable at desktop and 390 px | Agent-Probe | Screenshot review in API mode with the `log` mailer: set-password screen, invite result modal, Invited badge + Resend, manager create form; judge overflow, truncation, tap targets | B |
| AC-20a | Link truth table and spy-logger assertions | Fully-Automated | `npm run test --workspace @lumina/backend` (`invites.test.ts`) | B |
| AC-20b | Rollback leaves no user/token; set-password miss leaves the token unconsumed; invite -> archive -> PATCH active = 409; managers never get `link` | Hybrid | `npm run smoke` (`invites` rollback / manager / status checks) | B |
| AC-19 | A real email arrives through the user's SMTP account and the link works | Hybrid (manual, user-gated Step F) | not run by EXECUTE; residual Known-Gap row below | D |

Residual Known-Gap row (a named residual, never a proving strategy): AC-19 real delivery and real-client rendering. Justification: it needs the user's real SMTP account and recipient, and the plan forbids any real send before the user says so. Mitigation: every mailer code path (array/log mode, SMTP option mapping, failure handling, link and expiry rendering) is proven by the Fully-Automated and Hybrid gates above; Step F verifies only the live transport. Backlog stub: `account-invites-real-smtp-verification_NOTE_25-11-26.md` (written at UPDATE PROCESS). Net effect: the plan is VERIFIED (not "fully PASS") after EVL until Step F runs. No developed behavior rests on Known-Gap alone, so the vacuous-green ban is not triggered.

Failing stubs (Fully-Automated rows; red first):

```
Failing stub: test("should generate 32-byte base64url invite tokens and hash them to 64 hex chars", () => { throw new Error("NOT IMPLEMENTED - TDD stub: token generation / hashToken") })   // AC-2a
Failing stub: test("should build the invite link as base/#set-password=token and never use a request header", () => { throw new Error("NOT IMPLEMENTED - TDD stub: inviteLink / appBaseUrl") })   // AC-2a
Failing stub: test("should recognize an unusable password hash and never verify it", () => { throw new Error("NOT IMPLEMENTED - TDD stub: unusablePasswordHash") })   // AC-2a (A4)
Failing stub: test("should refuse the smtp mailer under NODE_ENV=test", () => { throw new Error("NOT IMPLEMENTED - TDD stub: createMailer guard") })   // AC-7a
Failing stub: test("should map ssl/tls/none to the right SMTP options with timeouts and no network", () => { throw new Error("NOT IMPLEMENTED - TDD stub: buildSmtpOptions") })   // AC-7a
Failing stub: test("should refuse to start in production without smtp, host, from address and APP_URL, naming the key", () => { throw new Error("NOT IMPLEMENTED - TDD stub: env production guard") })   // AC-8
Failing stub: test("should parse INVITE_RESEND_COOLDOWN_SECONDS 0 and reject -1", () => { throw new Error("NOT IMPLEMENTED - TDD stub: cooldown env parsing") })   // AC-8
Failing stub: test("should not put the token, link, body or recipient in log output and include no password in the email", () => { throw new Error("NOT IMPLEMENTED - TDD stub: logging and email content") })   // AC-9
Failing stub: test("should create imported users invited with an unusable hash and no default password option", () => { throw new Error("NOT IMPLEMENTED - TDD stub: buildImportPlan invited users") })   // AC-10a
Failing stub: test("should refuse to seed when NODE_ENV is production", () => { throw new Error("NOT IMPLEMENTED - TDD stub: assertSeedAllowed") })   // AC-12
Failing stub: test("should accept only a well-formed #set-password hash and compute account.invite parity", () => { throw new Error("NOT IMPLEMENTED - TDD stub: readSetPasswordToken / account.invite") })   // AC-13a
Failing stub: test("should return a link only to an admin (never a manager), and only for non-production log/array or a failed send", () => { throw new Error("NOT IMPLEMENTED - TDD stub: shouldExposeInviteLink truth table") })   // AC-20a
```

Legacy line form (existing consumers):
- backend unit: [Fully-automated: `npm run test --workspace @lumina/backend`] | frontend unit: [Fully-automated: `npm run test --workspace @lumina/frontend`]
- static: [Fully-automated: `npm run typecheck` + `npm run lint` + `git diff --check` + pinned literal-removal grep + logging grep]
- schema: [hybrid: `npm run db:migrate` x2 - precondition: local Postgres + backend env file]
- API domains: [hybrid: `npm run smoke` - precondition: local Postgres, array mailer, temp backend on 127.0.0.1:4100]
- browser: [hybrid: `npm run e2e` - precondition: ports 3000/3100/4000 free, `log` mailer]
- UI usability: [agent-probe: desktop + 390 px screenshots in API mode]
- real SMTP: [known-gap: documented; Step F user-gated; backlog stub at UPDATE PROCESS]

High-risk pack: required (auth/identity, schema/migration, public API contract, secrets/trust boundary), 5 JSON artifacts in `process/features/launch-readiness/active/account-invites_25-11-26/harness/account-invites/`; `adversarial-validation.json` must cover token guessing, manager-link takeover, status bypass via PATCH, mail bombing, partial create, and log leakage.

Backlog artifacts (all under `process/features/launch-readiness/backlog/`): `production-first-admin-bootstrap_NOTE_25-11-26.md` (EXECUTE C6); `account-invites-real-smtp-verification_NOTE_25-11-26.md`, `reinvite-archived-account_NOTE_25-11-26.md`, `manager-patch-team-member-email_NOTE_25-11-26.md`, `bulk-invite-send_NOTE_25-11-26.md`, `invite-clock-injection_NOTE_25-11-26.md` (UPDATE PROCESS).

Dimension findings:
- Infra fit: PASS - nodemailer pinned with an `npm ci` lockfile check; harness guards (B4) verified against the real playwright/smoke/index.ts anchors; no container surface touched.
- Test coverage: PASS - every AC maps to a Fully-Automated or Hybrid gate (AC-18 Agent-Probe); counts are minimums; stubs listed; the only residual is real SMTP delivery (named Known-Gap).
- Breaking changes: PASS - additive enum and table; `POST /users` widened to manager with optional admin-only `password`; `defaultPasswordHash` removal handled in C5 including `school-import.test.ts:94,457`; `SCHOOL_SCHEMA_VERSION` unchanged; frontend `setPersonStatus` narrowed in the same commit.
- Security surface: PASS - admin-only link, 256-bit hash-only token, one-transaction create/resend/accept, generic errors, `smtp` refused under test, production mail guard, seed guard, no secret logging; accepted residuals recorded (enumeration via 409, `trustProxy` gap).
- Section feasibility (Steps A-E): PASS - anchors verified (seed.ts:24, env.ts superRefine, playwright env, smoke `NODE_ENV: "test"`); P1/P2 consistency fixes applied. Highest-risk edit: the `POST /users` rewrite into one transaction (C1); sequence after the migration and token primitives and keep the rollback test red first.
- Section feasibility (Step F): PASS as a documented hard stop outside EXECUTE.

Open gaps: none blocking. Known gaps: AC-19 real SMTP delivery - known-gap: documented, user-gated Step F, backlog stub `account-invites-real-smtp-verification_NOTE_25-11-26.md`. Accepted deferrals (backlog): re-invite of an archived never-activated account, manager editing a teammate's email, bulk invite send, first-admin production bootstrap (MEDIUM; blocks a real production deploy; tracked as a Phase 06 prerequisite).

What this coverage does NOT prove:
- Vitest unit gates do not prove DB behavior (row locks, conditional consume, rollback); smoke covers that on the local dev database only, not a disposable one.
- The `array` and `log` mailers do not prove SMTP transport, TLS negotiation, provider rate limits, spam-folder placement or rendering in a real mail client (AC-19 / Step F).
- Smoke runs with `NODE_ENV=test` and e2e with `NODE_ENV=development`; no gate boots the app with `NODE_ENV=production`, so the production mail guard is proven only by `env-mail.test.ts` schema tests, not by a booted production server.
- The set-password IP limiter behind a reverse proxy (`trustProxy`) is not exercised; limiting is proven only for direct connections.
- e2e checks behavior in Chromium only; no component-level rendering tests exist (existing backlog theme).
- Access tokens issued before set-password, pause or archive stay valid up to 15 minutes (Phase 03 known gap, unchanged).
- Screenshot review (AC-18) is a judgment probe, not a pixel-regression check.

Gate: PASS
Accepted by: not required for PASS (no unresolved CONCERNs). Known gap AC-19 (real SMTP delivery) is recorded as a named residual and is NOT counted as proven; the user decides Step F after EVL (the first real send is a hard stop). Session: interactive; recommended menu options taken (Accept + print /goal).

## Autonomous Goal Block

```
SESSION GOAL: Replace the shared default account password with emailed single-use 72 h set-password links (invited status, auth_tokens, SMTP mailer, manager team creation, set-password screen)
Charter + umbrella plan: N/A - single plan (standalone pre-Phase-06 fix; context only: process/features/launch-readiness/active/lumina-v1-finish_23-11-26/lumina-v1-finish-umbrella_PLAN_23-11-26.md)
Autonomy: Steps A-E run without approval pauses (feedback_autonomous_phase_execution.md); subagent delegation stays mandatory (EXECUTE = vc-execute-agent on opus; EVL = spawned vc-tester); the orchestrator never edits source or runs gates itself.
Hard stop conditions / safety constraints:
- First real SMTP send: never inside EXECUTE; Step F only after the user says so and names the recipient address
- No db:reset / db:push / TRUNCATE; the only dev-DB change is npm run db:migrate applying 0007 (additive)
- Never read backend/.env or its example file; never print MAIL_PASSWORD, JWT_SECRET, tokens, invite links or the old default password
- Do not run npm run e2e if anything listens on ports 3000, 3100 or 4000 (a backend on 4000 could be in smtp mode); stop and ask
- Admins only ever see/copy an invite link; a manager response must never contain a link
- Demo mode stays untouched (zero /api/v1 calls in demo)
Next phase: EXECUTE: process/features/launch-readiness/active/account-invites_25-11-26/account-invites_PLAN_25-11-26.md (Steps A-E, then EVL by vc-tester, then UPDATE PROCESS; Step F is user-gated)
Validate contract: inline in plan (## Validate Contract, Gate: PASS, 25-11-26)
Execute start: fully-auto: npm run typecheck | npm run lint | npm run test --workspace @lumina/backend | npm run test --workspace @lumina/frontend | git diff --check ; hybrid: npm run db:migrate (x2) | npm run smoke (array mailer, 17 domains) | npm run e2e (log mailer, 29+4) ; probe: desktop + 390 px screenshots of set-password screen / invite modal / Invited badge ; high-risk pack: yes (harness/account-invites/)
```

## EVL fix cycle 1 (26-11-26)

- Fix 1 (lock order): `POST /auth/set-password` now finds the token's user without a lock (`findInviteUserId`), locks the user row (`lockUserForInvite`), then consumes the token scoped to that user (`consumeInvite(tx, token, userId, now)`), then activates `WHERE status='invited'`. Same user-then-token order as resend/PATCH/DELETE; every miss is the generic 400 with rollback. Smoke invites step 3b races set-password against resend and PATCH archived (3 rounds each).
- Fix 2 (copy): `PeopleForms.tsx` create descriptions are mode-aware; API data mode says "We'll email them a link to set their password." Demo text unchanged.
- Gates: typecheck, lint, backend 98/98, frontend 62/62, smoke 17 domains / 835 checks, e2e 30 API + 5 demo, `git diff --check`, no new log calls. No API contract or schema change.
