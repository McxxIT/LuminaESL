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
