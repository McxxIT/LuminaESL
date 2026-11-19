---
name: note:import-followups
description: "Backlog: two cosmetic gaps found during the D2 one-time import - the bell title/nav for school.imported and a next/image blob size warning"
date: 19-11-26
feature: backend-cutover
---

# Import follow-ups (cosmetic)

status: done-with-gap
item: D2-GAP-FOLLOWUPS (reported during D2, deferred as out of scope)
reason: Both are cosmetic, pre-existing or additive, and unrelated to import correctness; D2 was scoped to the import and its gates. Fixing them inside D2 would have widened the blast radius without a proving gate.

## Gap

Two findings did not block D2 and were reported rather than fixed:

1. **Bell title and navigation for `school.imported`.** The activity feed renders the action through
   `prettify()` as "School imported", files it under category `plans`, and navigates to Overview.
   The admin activity filter already routes `school.*` to Settings, so the bell and the filter
   disagree. Fix shape: add a `school.imported` entry to `ACTION_TITLES` and a `school` family rule
   in `navFor`.
2. **`next/image` blob warning.** The manager cancellation modal logs
   `Image with src "blob:..." has either width or height modified, but not the other`. Cosmetic
   console noise, first recorded in D1 and still present; unrelated to the import.

## Next step

Either fold both into the D3 (fallback removal) pass - the bell fix is a one-line map entry plus a
navigation rule - or take them as a single small cleanup plan. No research needed. The blast radius is
`frontend/app/components` plus the notification derivation; verify by opening the bell as an admin
after a forced import re-run and confirming the entry points at Settings.
