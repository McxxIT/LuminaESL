---
phase: account-invites-execute
date: 2026-11-25
status: COMPLETE
feature: launch-readiness
plan: process/features/launch-readiness/completed/account-invites_25-11-26/account-invites_PLAN_25-11-26.md
---

# Account Invites — EXECUTE exit summary

TL;DR: Steps A-E done; independent EVL green twice (smoke 17/835, e2e 30+5); review approved-with-concerns (user, 26-11-26). Step F (real SMTP delivery, AC-19) passed 26-11-26 with user confirmation, so every acceptance criterion is met and the task folder is archived to completed/.

## What Was Done

- A: migration `0007_windy_grandmaster.sql` (enum value `invited` plus the `auth_tokens` table) generated, reviewed, and applied to dev `lumina`; `lib/tokens.ts`; unusable-hash helpers; `lib/invites.ts`.
- B: nodemailer 10.6.1 and @types/nodemailer 8.0.2; 10 optional env keys plus the production mail guard; `lib/mailer.ts` and `lib/invite-email.ts`; `app.mailer` seam; harness guards (Playwright log mailer, smoke array mailer with startup assertion).
- C: `POST /users` (admin or manager, one transaction); `POST /users/:id/invite`; `POST /auth/set-password`; D8 guards; list filters accept `invited`; import creates invited users; seed guard; backlog stub `production-first-admin-bootstrap_NOTE_25-11-26.md`.
- D: frontend types, API calls, `account.invite`, people services, `invite-hash.ts`, `SetPasswordScreen`, LuminaApp and LoginScreen, `InviteForms.tsx`, and the wiring in three screens.
- E: smoke `invites` domain (112 checks), contract tests, `account-invites.spec.ts`, import and demo spec updates, README/PROGRESS/CUTOVER_PLAN edits, static gates, high-risk pack (4 of 5 files).

## What Was Skipped or Deferred

- Step F / AC-19: real SMTP send. Hard stop, waiting for the user.
- `review-decision.json`: written at UPDATE PROCESS.
- Smoke item 10 (import over HTTP): proven by `school-import.test.ts` plus e2e `import.spec.ts`, as the plan allows.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `npm run db:migrate` (applied, then no-op) | PASS |
| `npm run typecheck` / `npm run lint` | PASS |
| backend vitest | PASS, 12 files / 98 tests |
| frontend vitest | PASS, 11 files / 62 tests |
| `npm run smoke` | PASS, 17/17 domains, 817 checks |
| port check, then `npm run e2e` | PASS, 30 API + 5 demo |
| `git diff --check` | PASS |
| literal-removal gate | PASS, only `backend/src/db/seed.ts` |
| logging gate | PASS, no new matches beyond the 2 baseline lines in `routes/auth.ts` |
| `npm ci`, then typecheck | PASS; lockfile diff is only the two packages |
| AC-18 screenshot probe (1440 px and 390 px) | PASS |
| `validate-risk-artifacts.mjs` | 1 expected failure: `review-decision.json` missing |

## Plan Deviations

1. Changed `backend/tests/db-types.test.ts` (not in the blast-radius list). Its "explicit CORS in production" case now also passes valid mail keys, which the new production guard requires.
2. The `people.ts` API branch of `createTeacher` now calls `school.ts` `createTeacher` (a profile-only PATCH) instead of `createUser` plus `updateTeacherApi`. The old path PATCHes `/users/:id`, which managers cannot do, so a manager-created teacher would have failed.
3. The literal gate ran with `git grep --untracked`. The plan's command skips the new untracked files.
4. The `git status --porcelain -- backend/src/db` gate also lists `seed.ts` and `seed-guard.ts`. Both are planned C6 changes; the gate's expected list in the plan was incomplete.
5. `reset-password` returns 409 when status is `invited` OR the hash is unusable (D8, "every reactivation path").
6. Plaintext SMTP defaults to port 25 (the plan did not specify).
7. Added a new import warning code `status-reset`, emitted as one counted summary warning.
8. TDD order: `env.ts` was implemented before `env-mail.test.ts` (E4 requires typecheck first), and the import change came before its new test. All other pure modules were red first.
9. Wrote the C6 backlog stub as E6 requires, even though the handoff said not to write backlog notes.

## Test Infra Gaps Found

- One combined run had `beforeAll` hook timeouts in app/contract/auth-lifecycle while typecheck and lint ran at the same time. Isolated runs are green. Matches the existing flake theme.
- AC-19 real delivery is a known gap until Step F runs.

## Closeout Packet

- Selected plan: `account-invites_PLAN_25-11-26.md` (A-E ticked, Step 5 ticked).
- Verified: all exit gates above, on the executor run. Not verified: real SMTP (Step F), and a booted production server.
- Remaining: EVL by vc-tester; UPDATE PROCESS (context docs, backlog notes, registry status, `review-decision.json`); Step F after user approval.
- Classification: Keep in active/testing (EVL pending, AC-19 CONDITIONAL).

## Forward Preview

- Test Infra Found: smoke `invites` domain with `RESEND_WAIT_MS` sleeps; Playwright backend runs `MAIL_MAILER=log` and cooldown 0.
- Blast Radius Changes: `routes/users.ts` exports `insertAccount` (used by smoke); `app.mailer` decorator.
- Commands to Stay Green: the Exit Gate list in the plan; check the ports before e2e.
- Dependency Changes: nodemailer ^10.6.1, @types/nodemailer ^8.0.2 (backend).

Follow-up stubs created: `process/features/launch-readiness/backlog/production-first-admin-bootstrap_NOTE_25-11-26.md`.
CONTEXT_PARTIAL: none.

## UPDATE PROCESS closeout (26-11-26)

- Final classification: Keep in active/testing. VERIFIED (with gaps); Step F real SMTP send pending the user. Not archived.
- Execution commit: 1940ea6 `feat(auth): replace shared default password with emailed invite links` (60 files, not pushed).
- EVL (independent vc-tester, final run after review fix cycle 1): db:migrate no-op, typecheck, lint, backend vitest 12/98, frontend vitest 11/62, smoke 17 domains / 835 checks (invites 130, no 500s), e2e 30 API + 5 demo, git diff --check, literal-removal gate (only seed.ts), logging gate clean, lockfile only nodemailer, npm ci + typecheck. All green.
- Review: vc-code-reviewer approved-with-concerns, 0 Critical/High; EVL fix cycle 1 closed the set-password lock-order inversion and the stale create-form copy. User decision: approved-with-concerns (`harness/account-invites/review-decision.json`).
- SPEC Achievement: no separate SPEC (user decisions in the plan govern). AC-1..AC-18 met by passing automated or probe gates; AC-19 (real SMTP delivery) UNMET, residual strategy Agent-Probe/manual, backlog `account-invites-real-smtp-verification_NOTE_25-11-26.md`.
- Drift: HIGH. Strongly recommend UPDATE PROCESS -- harness/protocol files touched. (Done in this closeout.)
- Backlog written or updated: default-account-password (RESOLVED), account-invites-real-smtp-verification, manager-edit-team-member-403, public-self-register-decision, per-sender-invite-limit, account-invites-review-residuals, production-first-admin-bootstrap (Phase 06 prerequisite).
- User to-do: add `APP_URL` and `INVITE_RESEND_COOLDOWN_SECONDS` to the backend example env file (agents cannot edit it).
- Next: three follow-ups before Phase 06 (manager edit 403 first), then Phase 06 CI and Docker Compose; Step F whenever the user names a recipient.

## Step F result (26-11-26)

- Outcome: PASSED. AC-19 met (manual, user-confirmed).
- Setup: backend started manually with the user's real backend env (`MAIL_MAILER=smtp`, Gmail on port 587, `MAIL_ENCRYPTION=tls`) and `NODE_ENV=development`; frontend in API mode on :3000. Agents never read the env file.
- Action: the admin created one invited test student ("Step F Test Student") using the address the user chose (not recorded here). Response 201, status `invited`, invite `{sent: true, mode: smtp}`, no error, and no link returned to the admin (correct for a successful send).
- User confirmation: the email arrived, the link opened the "Set your password" screen, the password was set, and sign-in worked.
- Cleanup: the test account (`f9f91bf2-37aa-4118-9cee-ca032b4baa2b`) was archived via `PATCH` status `archived` (200). Both servers stopped; ports 3000 and 4000 free. No resend was needed.
- Env example: `APP_URL`, `INVITE_RESEND_COOLDOWN_SECONDS`, and a documented `MAIL_*` placeholder block (`MAIL_MAILER=log` default, no real values) were added to `backend/.env.example` with the user's approval.
- Product decisions taken during Step F (decisions, not backlog): (1) user names stay required and hand-typed (no auto-name from the email address); (2) a rename updates live screens only, while past activity and notification text keeps the name used at the time (audit-log behaviour).

## UPDATE PROCESS final closeout (26-11-26)

- Final classification: Ready for UPDATE PROCESS archival; archived to `process/features/launch-readiness/completed/account-invites_25-11-26/`.
- SPEC Achievement (supersedes the earlier line above): no separate SPEC (plan acceptance criteria govern). AC-1..AC-18 met by passing automated or probe gates; AC-19 MET (manual, user-confirmed Step F). No unmet criteria, no Known-Gap residual.
- Backlog: `account-invites-real-smtp-verification` and `default-account-password` are resolved. Open follow-ups before Phase 06: manager edit 403, per-sender invite limit, public self-register decision; then Phase 06.
