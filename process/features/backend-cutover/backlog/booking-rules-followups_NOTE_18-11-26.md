---
name: note:booking-rules-followups
description: "Backlog: POST /lessons does not debit, unlocked plan selection, student self-purchase without payment"
date: 18-11-26
feature: backend-cutover
---

# Booking and billing rule follow-ups

status: done-with-gap
item: B3-GAP-RULES (known gaps from b3-domain-smoke_PLAN_18-11-26 plus one new finding)
reason: These need product decisions or billing work outside B3; the smoke asserts current behavior so any change is visible.

## Gaps

1. New finding: backend `POST /lessons` (teacher/manager/admin schedules a lesson) does not debit a credit, while the demo teacher/manager add-lesson paths (`scheduleLessonForStudent`, `bookLessonOnBehalf`) debit 1. A student who cancels such a lesson early is refunded +1, so credits can be minted. Smoke currently asserts "no debit" for `POST /lessons`.
2. Plan selection is not locked: `resolveLessonDefaults` picks `nextPlanIndex` + reserved lessons without a lock, so two concurrent bookings can get the same plan.
3. A student may self-purchase up to 100 credits per request with no payment check (`POST /credits`, reason `purchase`). Smoke asserts 2 OK and 101 refused.

## Next step

NEW PLAN REQUIRED: decide whether `POST /lessons` should debit (and refund only debited lessons); lock plan selection with the booking-concurrency work; gate student purchases behind a payment provider.
