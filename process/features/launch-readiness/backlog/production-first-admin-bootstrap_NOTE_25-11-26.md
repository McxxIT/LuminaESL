---
name: note:production-first-admin-bootstrap
description: "Backlog: no first-admin path in production once the seed refuses NODE_ENV=production"
date: 25-11-26
feature: launch-readiness
---

# Production first-admin bootstrap

status: OPEN. PHASE 06 PREREQUISITE (confirmed at UPDATE PROCESS 26-11-26): resolve or accept before Phase 06 ships production.
reason: The account-invites fix (25-11-26, Step C6) made `backend/src/db/seed.ts` refuse `NODE_ENV=production` (`assertSeedAllowed`). The seed was the only way to create the first admin.
item: account-invites plan, Open Item 3
priority: MEDIUM. Blocks a real production deploy. Phase 06 prerequisite: resolve or accept before Phase 06 ships production.

## Gap

- A fresh production database has no admin, and every route that creates accounts needs one.
- The seed's dev-only password must never reach production, so re-enabling the seed is not an option.

## Proposed fix

- A one-off CLI (for example `npm run admin:bootstrap --workspace @lumina/backend`) that creates the
  first admin as `invited`, issues an invite token through `lib/invites.ts`, sends it through the
  configured mailer, and prints nothing secret (no token, no link).
- Refuse to run when any admin already exists.
- Decide together with Phase 06 (Docker compose and the deploy runbook).
