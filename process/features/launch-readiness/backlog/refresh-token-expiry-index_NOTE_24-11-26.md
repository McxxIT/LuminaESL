---
name: note:refresh-token-expiry-index
description: "Backlog: refresh_tokens has no expires_at index, so the hourly prune sweep is a sequential scan"
date: 24-11-26
feature: launch-readiness
---

# refresh_tokens expiry index

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Negligible at school scale; needs a migration, so its own phase.
item: Phase 03 known gap (R3)
priority: low

## Gap

- `refresh_tokens` is indexed only on `user_id` (plus unique `token_hash`). The hourly global sweep in
  `pruneRefreshTokens` filters on `expires_at` and `revoked_at`, so it scans the table. At school
  scale (about 1,100 rows on dev) this is negligible.

## Options

- Add `refresh_tokens_expires_at_idx` (needs a migration, so its own phase) if the row count grows.

## Next step

Revisit only if the sweep shows up in timing.
