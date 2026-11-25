---
name: note:per-sender-invite-limit
description: "Backlog: per-actor invite and mail throttle plus restricting name content in invite emails"
date: 25-11-26
feature: launch-readiness
---

# Per-sender invite limit

status: OPEN, user-chosen follow-up before Phase 06
item: account-invites review
priority: HIGH-ish. Managers (and admins) can trigger real outbound mail.

## Gap

- Rate limiting is per IP and per route only; a single signed-in actor can create or resend many invites, each a real email.
- User-supplied names are rendered into the invite email body and subject.

## Fix options

- A per-actor limit on create and resend (for example 20 per hour, counted from `auth_tokens` or `activity`), returning 429.
- Restrict or sanitise name content in the invite email (length cap, strip links and control characters).
- Gate: smoke case for the 21st invite in an hour; unit test for the sanitiser.

## Updated by manager-team-edits (26-11-26)

- A new mail vector exists: an admin changing an INVITED person's email re-issues the invitation with the resend cooldown bypassed (`cooldownSeconds: 0`, decision D8) and mails the new address. Bounded today only by admin-only access and the per-IP route limit.
- Every invite issued by that path writes a `user.invite_resent` activity row (targetId = the user, actor = the admin), so a per-actor limit can count these rows too. Count both create and PATCH-issued invites.
- The 30 s resend cooldown stays the only per-actor guard for the Resend button; it is deliberately bypassed for the email-change path and for `POST /users`.
