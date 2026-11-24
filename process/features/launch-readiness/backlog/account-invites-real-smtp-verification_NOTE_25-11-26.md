---
name: note:account-invites-real-smtp-verification
description: "Backlog: Step F of the account-invites plan - first real SMTP send and AC-19, user-gated hard stop"
date: 25-11-26
feature: launch-readiness
---

# Real SMTP delivery verification (Step F / AC-19)

status: OPEN, waiting for the user
item: account-invites plan Step F, acceptance criterion AC-19
priority: HIGH. Must run before the invite flow is relied on, and before Phase 06 documents production mail.

## Gap

Every test uses an array mailer (smoke) or the `log` mailer (e2e); smtp is refused under `NODE_ENV=test`. No real email has ever been sent by this code, so SMTP settings, deliverability, and the rendered invite email are unverified.

## Steps (user-gated, never run by an agent without an explicit OK)

1. The user names the recipient mailbox and approves one real send.
2. Check `MAIL_ENCRYPTION` against the port: `ssl` with 465, or `tls` with 587 (plaintext defaults to port 25). Gmail needs an app password; `MAIL_USERNAME` and `MAIL_PASSWORD` must be set together.
3. Run one invite against dev `lumina` with `MAIL_MAILER=smtp` and `NODE_ENV=development`, confirm delivery, open the link, set a password, sign in.
4. Record the result in the account-invites task folder and mark AC-19 met. Only then can the task folder move to `completed/`.

## Notes

- Never print the SMTP password, token, or link in logs or reports.
- User to-do: add `APP_URL` and `INVITE_RESEND_COOLDOWN_SECONDS` to the backend example env file (agents cannot edit it).
