---
name: note:access-token-revocation
description: "Backlog: access JWTs are stateless, so a reset, password change, pause, or archive only ends the session at the next refresh (up to 15 minutes)"
date: 24-11-26
feature: launch-readiness
---

# Access-token revocation window

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Accepted at school scale for v1; revocation needs a token-version or per-request status check design.
item: Phase 03 known gap (validate-contract), adversarial scenario "already-issued access JWT keeps working"
priority: low-medium (school scale; accepted for v1)

## Gap

- `app.authenticate` only verifies the JWT signature. After an admin reset, a self password change,
  or a pause/archive, refresh tokens are revoked immediately, but an already-issued access token
  stays valid for `ACCESS_TOKEN_TTL` (15 minutes).
- The reset modal copy already says "lose access within 15 minutes".

## Options

1. Add a per-user `token_version` (schema change, new migration) carried in the JWT and checked in
   `authenticate`.
2. Check `users.status` (and a `password_changed_at` timestamp) in `authenticate` on every request:
   one indexed read per request, no schema change for the status-only variant.
3. Shorten `ACCESS_TOKEN_TTL` (cheapest; more refresh traffic).

## Next step

New plan required if the 15-minute window is not acceptable for launch. Not part of v1 unless the
Phase 03 reviewer concern is escalated.
