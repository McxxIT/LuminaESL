---
name: note:refresh-and-password-change-atomicity
description: "Backlog: /auth/refresh claim is not atomic and change-password issues the session and logs activity outside its transaction"
date: 24-11-26
feature: launch-readiness
---

# Refresh claim and change-password atomicity

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Low-severity review findings, deferred by user decision (option A, no fixes now).
item: Phase 03 reviewer findings L3 and L4
priority: low

## Gap

- **L3 `/auth/refresh`** (`backend/src/routes/auth.ts`, lines about 274-291): the token is read, then
  revoked in a separate statement, so two concurrent refreshes with the same cookie can both succeed.
- **L4 `/auth/change-password`** (lines about 351-358): the password update and token revocation are
  one transaction, but `issueSession` and `logActivity` run after commit. A failure there leaves the
  password changed with no new session (the user is simply signed out), and an activity-log failure
  surfaces as a 500 after a successful change.

## Fix options

- L3: claim with `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL
  RETURNING ...`; claim plus the new-token insert in one transaction; no row returned means 401.
- L4: insert the new refresh token inside the same transaction; make `logActivity` best-effort
  (caught and logged) so it cannot fail the request.

## Next step

Small hardening plan; can be bundled with the access-token revocation work. Add a concurrency smoke
check modeled on `frontend/e2e/api/credit-concurrency.spec.ts`.
