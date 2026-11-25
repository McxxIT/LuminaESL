---
name: note:admin-password-recovery
description: "Backlog: no recovery path for a locked-out single admin, and an admin can reset another admin's password with no step-up check"
date: 24-11-26
feature: launch-readiness
---

# Admin password recovery and admin-on-admin reset

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Needs a product decision (recovery script versus step-up) and a small new plan.
item: Phase 03 Decision R2 plus reviewer finding M2
priority: medium

## Gap

1. **Lockout (R2):** `POST /users/:id/reset-password` blocks self-reset by design, and there is no
   email delivery. A single admin who forgets the password needs manual DB recovery.
2. **Admin-on-admin reset (reviewer M2):** any admin session (including a hijacked one) can reset a
   different admin's password with no step-up. The adversarial scenario "admin resets a different
   admin's password" is recorded as `ruled_out: false` in the Phase 03 evidence pack.

## Options

- A small operator script (`db:reset-password`-style, host access only, refuses production without
  an explicit flag) for lockout recovery.
- For M2, either refuse admin targets through the API (admins are recovered only by the script), or
  require the acting admin's current password in the reset request (step-up).
- Optional: a manager-scoped reset limited to the manager's own team.

## Next step

Small new plan. Prefer "refuse admin targets via API plus recovery script": one rule closes both gaps.
