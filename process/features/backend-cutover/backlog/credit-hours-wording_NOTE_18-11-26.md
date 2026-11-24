---
name: note:credit-hours-wording
description: "Backlog: UI still says 'credit hours'/'hrs' although 1 credit = 1 lesson"
date: 18-11-26
feature: backend-cutover
---

# "Credit hours" wording

status: done (25-11-26, commit 5c1b4b9, Phase 05)
item: B3-GAP-WORDING (SPEC open question 1, deferred)
reason: Copy change was deferred by the SPEC; B3 changed the unit (1 credit per lesson) but not the labels.

## Gap

Labels such as "LESSON CREDITS 24.0 hrs", "Hours remaining", "credit hours", "5 lesson hours" (`frontend/app/lib/data.ts` creditPackages), the `CreditLedgerEntry.hours` field name, and the backend `hours` column all still say hours. Package details were corrected to the right lesson counts.

## Next step

NEW PLAN REQUIRED: rename the visible copy to "credits"/"lessons" across student, manager, and admin screens; decide whether to rename the API field (public contract change) or keep `hours` internally.

## Resolution

Resolved 25-11-26 (launch-readiness Phase 05, commit `5c1b4b9`). 28 visible strings now say "credits" / "1 credit" / "Lesson credits" / "credit packages" / "Credits:"; genuine hours (lesson durations, due times) are unchanged. `CreditLedgerEntry.hours` and the backend `hours` column keep their names (no contract change). `frontend/tests/credit-copy.test.ts` guards against regressions in a fixed file list (extend it when new screens are added).
