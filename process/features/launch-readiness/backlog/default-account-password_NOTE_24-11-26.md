---
name: note:default-account-password
description: "RESOLVED 26-11-26 by commit 1940ea6 (emailed single-use set-password links); fully resolved incl. real SMTP delivery verified 26-11-26 (Step F)"
date: 24-11-26
feature: launch-readiness
---

# Shared default password for admin-created accounts

status: RESOLVED by commit 1940ea6 `feat(auth): replace shared default password with emailed invite links` (account-invites fix, 25/26-11-26). Fully resolved: real SMTP delivery was verified on 26-11-26 (Step F passed, user-confirmed; see `account-invites-real-smtp-verification_NOTE_25-11-26.md`).
item: Phase 03 reviewer finding M1 (pre-existing)
priority: was HIGH

## What was fixed

- Accounts created by an admin or manager are now `invited` with an unusable password hash and cannot sign in.
- They receive a single-use set-password link (72 h, sha256-only token storage in `auth_tokens`) through the backend SMTP mailer. The shared default is gone from the frontend and the backend; the only remaining dev-only password is in `backend/src/db/seed.ts`, which refuses `NODE_ENV=production`.
- Imported users are created `invited` with no email; admins can resend an invite (30 s cooldown, old link invalidated).

## What is still open

- Nothing for this item. Real SMTP delivery passed on 26-11-26.
- Related follow-ups: `manager-edit-team-member-403_NOTE_25-11-26.md`, `public-self-register-decision_NOTE_25-11-26.md`, `per-sender-invite-limit_NOTE_25-11-26.md`, `account-invites-review-residuals_NOTE_25-11-26.md`, `production-first-admin-bootstrap_NOTE_25-11-26.md`.
