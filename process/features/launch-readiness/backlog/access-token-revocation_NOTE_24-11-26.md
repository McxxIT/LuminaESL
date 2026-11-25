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
  a pause/archive, or an admin changing an active person's email, refresh tokens are revoked immediately, but an
  already-issued access token stays valid for `ACCESS_TOKEN_TTL` (15 minutes).
- The reset modal copy already says "lose access within 15 minutes".

## Widenings from the manager-team-edits fix (26-11-26)

- `PATCH /users/:id` now revokes refresh tokens inside its single transaction on a pause and on an admin email change of an ACTIVE person. The access-token window above applies to both.
- `authenticate` never checks account status, so a **paused or archived MANAGER keeps team-write authority** (rename, pause/reactivate) for up to 15 minutes after the pause commits. The actor is still activity-logged; the window is the residual.
- A manager pause of a member has the same shape: the member keeps read/write access for up to 15 minutes.

## Options

1. Add a per-user `token_version` (schema change, new migration) carried in the JWT and checked in
   `authenticate`.
2. Check `users.status` (and a `password_changed_at` timestamp) in `authenticate` on every request:
   one indexed read per request, no schema change for the status-only variant.
3. Shorten `ACCESS_TOKEN_TTL` (cheapest; more refresh traffic).

## Next step

New plan required if the 15-minute window is not acceptable for launch. Not part of v1 unless the
Phase 03 reviewer concern is escalated.
