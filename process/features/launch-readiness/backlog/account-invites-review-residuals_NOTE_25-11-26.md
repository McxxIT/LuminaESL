---
name: note:account-invites-review-residuals
description: "Backlog: Low code-review residuals and known gaps from the account-invites fix"
date: 25-11-26
feature: launch-readiness
---

# Account-invites review residuals (Low)

status: OPEN, none blocking
item: account-invites review (approved-with-concerns, 26-11-26) and plan Known Gaps
priority: low

## Items

1. Archived never-activated accounts have no path back to `invited`; an admin must re-invite.
2. Manager email-existence oracle: a duplicate email returns 409 to managers. Accepted.
3. `APP_URL` should be https-only in production.
4. The seed guard refuses only when `NODE_ENV === "production"`.
5. `MAIL_USERNAME` and `MAIL_PASSWORD` must be set together; the env check should say so clearly.
6. An invited teacher is labeled "(paused)" in scheduling pickers.
7. No route-level negative test that a manager never receives a copyable link in production mode.
8. No manager duplicate-email 409 test.
9. A manager cannot fix an invitee's mistyped email (covered by `manager-edit-team-member-403_NOTE_25-11-26.md`).
10. Plan ideas not scheduled: bulk invite send, injectable clock for invite expiry tests.
11. Related existing notes affected by this fix: `admin-password-recovery` (the `auth_tokens` table leaves room for a `reset` purpose), `access-token-revocation` (set-password revokes refresh tokens only), `refresh-and-password-change-atomicity` (set-password is one transaction), `trust-proxy-and-limiter-store` (invite link base comes from `APP_URL`, never headers; set-password is IP-limited).
