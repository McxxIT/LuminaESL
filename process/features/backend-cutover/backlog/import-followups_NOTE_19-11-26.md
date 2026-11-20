---
name: note:import-followups
description: "Backlog: two cosmetic gaps found during the D2 one-time import - the bell title/nav for school.imported and a next/image blob size warning"
date: 19-11-26
feature: backend-cutover
---

# Import follow-ups (cosmetic)

status: done (item 1 in the D3 pass, item 2 on 20-11-26)
item: D2-GAP-FOLLOWUPS (reported during D2, deferred as out of scope)
reason: Both are cosmetic, pre-existing or additive, and unrelated to import correctness; D2 was scoped to the import and its gates. Fixing them inside D2 would have widened the blast radius without a proving gate.

## Resolution

1. **Bell title and navigation (done 20-11-26).** `frontend/app/lib/school/notifications.ts` now maps
   `school.imported` to "School imported" in `ACTION_TITLES` and routes the `school` family to
   `Settings` (admin) or `Overview` (other roles) in `navFor`, so the bell matches the activity filter.
2. **`next/image` blob warning (done 20-11-26).** The cause was a fixed `width`/`height` pair with
   `height: "auto"` (and `maxWidth`), so Next saw one dimension modified without the other whenever the
   attachment's aspect ratio differed from 3:2. `ManagerApprovals.tsx` and `TeacherLessons.tsx` now use
   explicit CSS width/height equal to the attributes plus `objectFit: "contain"`, which renders exactly
   the declared box and keeps the preview undistorted. Verified with `api/cancellation-refund.spec.ts`:
   the evidence still renders as a blob URL, downloads on click, and the console warning is gone.

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

Nothing left in this note. Both findings are closed; keep the cancellation spec as the regression
gate for the evidence preview (it asserts visibility, the blob URL, and a working download).
