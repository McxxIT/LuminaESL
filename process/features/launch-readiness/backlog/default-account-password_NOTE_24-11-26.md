---
name: note:default-account-password
description: "Backlog: every admin-created account gets the same fixed default password, shipped in the client bundle, with no forced change on first login"
date: 24-11-26
feature: launch-readiness
---

# Shared default password for admin-created accounts

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Pre-existing; needs a design decision (generated one-time password versus forced change) and a contract/schema plan.
item: Phase 03 reviewer finding M1 (pre-existing, not introduced by Phase 03)
priority: HIGH. Should-fix before launch, and before Phase 06 packages a deployable stack.

## Gap

- The frontend school API layer (`frontend/app/lib/school/api/school.ts`, lines about 18 and 55)
  sends one fixed default password for every account an admin or manager creates. The value is in the
  client bundle and in seed/progress docs (it is intentionally not repeated here).
- There is no forced change on first login, so anyone who knows the default can sign in to any
  account whose owner has not changed it. Phase 03 added self-service change and admin reset, but
  nothing requires their use.

## Options

1. Server-generated one-time password returned once in the create response and shown to the admin
   (no schema change; the admin shares it out of band).
2. A `must_change_password` flag set on create/reset and enforced after login (schema change and
   migration, so a new plan).
3. Both: generated password plus the flag.

## Next step

New plan, scheduled before launch. Option 1 is the cheapest meaningful fix; option 2 closes the
loop. Needs frontend and backend contract updates (`types.ts`, `contract.test.ts`, smoke, e2e).
