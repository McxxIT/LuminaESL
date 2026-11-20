---
name: note:import-followups
description: "Backlog: two cosmetic gaps found during the D2 one-time import - the bell title/nav for school.imported and a next/image blob size warning"
date: 19-11-26
feature: backend-cutover
---

# Import follow-ups (cosmetic)

status: item-1-done (D3 pass, 20-11-26); item-2 open
item: D2-GAP-FOLLOWUPS (reported during D2, deferred as out of scope)
reason: Both are cosmetic, pre-existing or additive, and unrelated to import correctness; D2 was scoped to the import and its gates. Fixing them inside D2 would have widened the blast radius without a proving gate.

## Resolution

1. **Bell title and navigation (done 20-11-26).** `frontend/app/lib/school/notifications.ts` now maps
   `school.imported` to "School imported" in `ACTION_TITLES` and routes the `school` family to
   `Settings` (admin) or `Overview` (other roles) in `navFor`, so the bell matches the activity filter.
2. **`next/image` blob warning (open).** Still logged by the manager cancellation modal; cosmetic.

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

Item 1 is closed (D3 pass). Item 2 (`next/image` blob warning) remains open and cosmetic; fix it with
the next `ManagerApprovals.tsx` touch (give the evidence image an explicit `width`/`height` or a
`style` with both auto) rather than a dedicated plan. Verify by opening the manager cancellation
review modal and confirming the console stays clean.
