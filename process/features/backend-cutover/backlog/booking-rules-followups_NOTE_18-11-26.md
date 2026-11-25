---
name: note:booking-rules-followups
description: "Backlog: POST /lessons does not debit, unlocked plan selection, student self-purchase without payment"
date: 18-11-26
feature: backend-cutover
---

# Booking and billing rule follow-ups

status: done (23-11-26; items 1-2 fixed 20-11-26, item 3 fixed 23-11-26)
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
3. **Fixed 23-11-26.** Staff-managed credits policy: `POST /credits` is now
   `requireRole(["admin", "manager"])`, so a student self-purchase returns `403` with an unchanged
   balance. Admins and team-scoped managers keep top-up/adjustment rights and the 100-credit cap.
   API-mode `StudentBilling.tsx` hides "Buy credits", the purchase modal, and the demo VISA/auto-renew
   card; demo mode is unchanged. Gate: `npm run smoke` (`credits`), `backend/tests/contract.test.ts`,
   `frontend/e2e/api/uploads.spec.ts`
   (`process/features/launch-readiness/active/lumina-v1-finish_23-11-26/`).

## Gaps

1. New finding: backend `POST /lessons` (teacher/manager/admin schedules a lesson) does not debit a credit, while the demo teacher/manager add-lesson paths (`scheduleLessonForStudent`, `bookLessonOnBehalf`) debit 1. A student who cancels such a lesson early is refunded +1, so credits can be minted. Smoke currently asserts "no debit" for `POST /lessons`.
2. Plan selection is not locked: `resolveLessonDefaults` picks `nextPlanIndex` + reserved lessons without a lock, so two concurrent bookings can get the same plan.
3. A student may self-purchase up to 100 credits per request with no payment check (`POST /credits`, reason `purchase`). Smoke asserts 2 OK and 101 refused.

## Next step

None. Items 1-3 are done; keep the smoke debit/credit assertions as the regression gate.
