---
name: note:booking-rules-followups
description: "Backlog: POST /lessons does not debit, unlocked plan selection, student self-purchase without payment"
date: 18-11-26
feature: backend-cutover
---

# Booking and billing rule follow-ups

status: 1-2-done (20-11-26); 3-open
item: B3-GAP-RULES (known gaps from b3-domain-smoke_PLAN_18-11-26 plus one new finding)
reason: These need product decisions or billing work outside B3; the smoke asserts current behavior so any change is visible.

## Resolution

1. **Fixed 20-11-26.** `POST /lessons` now debits 1 credit inside the create transaction
   (`credit_entries` `reason: "booking"`), refuses a balance under 1, and the student cancel refunds
   only a lesson that has that debit row. Smoke asserts the debit delta.
2. **Fixed 20-11-26.** `resolveLessonDefaults` reads the enrollment `FOR UPDATE` (`.for("update")`), so
   plan selection is serialized per student. The ledger itself is now serialized too: all seven
   credit-mutating paths take `lockStudentCredits` first (see
   `process/features/people-billing/completed/credit-ledger-serialization_20-11-26/`).
3. **Open.** Student self-purchase (up to 100) still has no payment check.

## Gaps

1. New finding: backend `POST /lessons` (teacher/manager/admin schedules a lesson) does not debit a credit, while the demo teacher/manager add-lesson paths (`scheduleLessonForStudent`, `bookLessonOnBehalf`) debit 1. A student who cancels such a lesson early is refunded +1, so credits can be minted. Smoke currently asserts "no debit" for `POST /lessons`.
2. Plan selection is not locked: `resolveLessonDefaults` picks `nextPlanIndex` + reserved lessons without a lock, so two concurrent bookings can get the same plan.
3. A student may self-purchase up to 100 credits per request with no payment check (`POST /credits`, reason `purchase`). Smoke asserts 2 OK and 101 refused.

## Next step

item 3 only: gate student purchases behind a payment provider (or cap self-purchase). Items 1 and 2
are done; keep the smoke debit assertions as the regression gate.
