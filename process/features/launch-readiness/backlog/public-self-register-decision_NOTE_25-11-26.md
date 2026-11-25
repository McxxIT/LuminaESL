---
name: note:public-self-register-decision
description: "Backlog: product decision on public POST /auth/register student sign-up with a self-chosen password, which sits outside the invite model"
date: 25-11-26
feature: launch-readiness
---

# Public self-registration decision

status: OPEN, user-chosen follow-up before Phase 06 (needs a product decision first)
item: account-invites review
priority: HIGH-ish

## Gap

`POST /auth/register` (public student sign-up with a password the user picks) was not changed by the invite fix. Every other account path is now invite-only with an unusable hash until activation, so open self-registration is an inconsistent trust boundary.

## Options

- Remove or disable it in API mode (invite-only school).
- Keep it, but require approval or an email-verification token through `auth_tokens`.
- Keep as is and document the decision.
