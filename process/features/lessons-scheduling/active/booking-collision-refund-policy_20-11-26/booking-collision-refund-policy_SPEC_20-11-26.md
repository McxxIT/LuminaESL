---
name: spec:booking-collision-refund-policy
description: "Prevent conflicting active lessons and enforce booking-debit-only refunds while preserving lesson and ledger history"
date: 20-11-26
feature: lessons-scheduling
---

# Booking Collision and Refund Policy Specification

## Summary

Lumina ESL must prevent scheduled or live lessons for the same teacher at the same date and time, while preserving completed and cancelled lesson history. Refunds must be supported only when the lesson has an earlier booking debit; a cancellation or absence must never mint credit from a lesson that was never charged.

## User Stories / Jobs To Be Done

- As a manager or teacher, I want to schedule a lesson only when that teacher is free, so that students and staff do not receive conflicting lessons.
- As a student, I want a valid cancellation or absence to restore exactly the credit I was charged, so that billing matches the lesson.
- As an administrator, I want historical duplicates to remain available, so that migration and cleanup do not erase valid past records.
- As a staff reviewer, I want active duplicates handled explicitly before a uniqueness rule is enforced, so that existing schedule data is not changed silently.

## What The User Wants (Behavioral Outcomes)

- An active lesson is one with status `scheduled` or `live`.
- Two active lessons cannot exist for the same teacher, date, and start time.
- A booking or schedule action that collides with another active lesson is rejected. It must not create a lesson or spend a credit.
- A rescheduled lesson cannot move into a teacher/date/time already occupied by another active lesson.
- A rebook attempt that would create or retain an active collision is rejected clearly. Rebook policy, including whether the original lesson is cancelled or replaced and whether another debit is allowed, is unchanged and remains deferred.
- Cancelled and completed lessons remain available in history. They do not block a new active lesson merely because they share the same teacher, date, and time.
- Existing duplicate active lessons remain accessible during a reviewed cleanup process. The system does not automatically merge or delete history.
- A refund is available only for a lesson that has a matching booking debit.
- A cancellation or absence that is not eligible under the existing policy does not create a refund.
- Cancelling or recording the absence of the same lesson more than once cannot create more than one refund or more than one absence outcome.

## Flow / State Diagram

```text
Staff submits create, rebook, or reschedule request
  |
  +--> request targets cancelled/completed lesson? --> Collision rules do not apply
  |
  +--> requested teacher/date/time occupied by another scheduled/live lesson?
        |
        yes --> reject as conflict
        |       - no active lesson created or moved
        |       - no booking debit added
        |       - clear conflict response to the caller
        |
        no --> keep existing action policy
               |
               +--> debit policy already confirmed:
                     credit available --> create or change active lesson
                     insufficient credit --> reject

Cancellation or absence
  |
  +--> find the lesson's student
  |
  +--> find a matching booking debit
        |
        no --> no refund
        |
        yes --> apply timing or absence policy
                 |
                 +--> eligible and not previously refunded --> add exactly one refund
                 +--> ineligible or already refunded --> no additional refund
```

## Acceptance Criteria (Testable Outcomes)

- AC1: Creating or changing an active lesson to a teacher/date/time already used by another scheduled or live lesson is rejected; no lesson, slot change, or credit debit occurs on the rejected action.
  proven by: API smoke booking and lessons scenarios, plus a new Playwright active-collision scenario for create and reschedule
  strategy: Hybrid

- AC2: A conflict is reported as a deterministic conflict response for create, rebook, and reschedule actions. The user can distinguish the conflict from insufficient credit and from validation errors.
  proven by: API smoke lessons and rebook scenarios, plus Playwright API create/reschedule/rebook cases
  strategy: Fully-Automated

- AC3: Concurrent attempts to create or claim the same active teacher/date/time produce one accepted winner and one conflict; no extra lesson or debit is produced.
  proven by: a new Playwright concurrent collision scenario, running against a disposable or reviewed local database
  strategy: Hybrid

- AC4: A cancelled or completed lesson with the same teacher/date/time does not prevent creation of a scheduled or live lesson at that time.
  proven by: API smoke lessons scenario plus a migration/data-safety regression scenario
  strategy: Hybrid

- AC5: Existing duplicate groups containing only cancelled or completed history remain unchanged.
  proven by: migration dry-run and post-migration duplicate inventory review
  strategy: Agent-Probe

- AC6: Existing duplicate active lessons are not silently deleted or merged. A reviewed cleanup result is required before active uniqueness can be enforced.
  proven by: migration preflight duplicate inventory and reviewed cleanup gate
  strategy: Agent-Probe

- AC7: A student cancellation refunds credit only when the lesson has a matching booking debit and the existing cancellation timing rule makes it eligible.
  proven by: Playwright cancellation-refund spec and API smoke lessons cancellation scenarios
  strategy: Hybrid

- AC8: A teacher absence refunds credit only when the lesson has a matching booking debit and the lesson transitions to cancelled for the first time.
  proven by: Playwright credit-concurrency absence race and API smoke absence scenarios
  strategy: Hybrid

- AC9: Approving a cancellation, repeating a cancellation, or repeating an absence cannot refund the same lesson more than once.
  proven by: Playwright credit-concurrency spec and cancellation-refund spec
  strategy: Fully-Automated

- AC10: If no matching booking debit exists, cancellation or absence produces no refund, even if the lesson later becomes cancelled.
  proven by: a new API smoke refund-consistency scenario with a no-debit fixture
  strategy: Hybrid

- AC11: Insufficient-credit booking remains a balance rejection, while a teacher/time collision remains a separate conflict response.
  proven by: Playwright booking and credit-concurrency specs, plus API smoke booking scenarios
  strategy: Fully-Automated

- AC12: No refund is added for a lesson whose booking debit was later adjusted away or otherwise does not represent a booking debit.
  proven by: refund-consistency API smoke scenario
  strategy: Hybrid

## Out Of Scope

- Rebook policy changes, including whether rebook cancels the original lesson or charges again.
- Payment-provider enforcement for credit purchase.
- Any automatic deletion or merging of cancelled or completed lesson history.
- Automatic cleanup of existing duplicate active lessons.
- Changing current cancellation timing windows or teacher-absence refund settings.
- Changes to credit purchase limits or to credit adjustment behavior.
- Group lessons or scheduling any duration other than the established 25-minute one-to-one lesson.

## Constraints

- Active uniqueness is limited to scheduled and live lessons only.
- The same teacher, date, and start time is the collision key.
- Cancelled and completed lessons do not participate in active uniqueness.
- Existing history must be preserved unless an authorized reviewer explicitly approves a cleanup or merge.
- A reviewed migration process must prevent existing conflicting active rows from being silently fixed or destroyed.
- A refund requires evidence of a matching booking debit for the same lesson and student.
- A refund must not be produced if there is no debit, regardless of existing cancellation or absence policy.
- Existing timing and teacher-absence eligibility rules remain in force.
- Repeated cancellation or absence actions must remain idempotent.
- Conflict and insufficient-credit outcomes must remain distinguishable.
- The implementation must preserve sequential behavior outside the collision and concurrent-refund cases.

## Open Questions

- None.

## Background / Research Findings

- Advisory credit locking is already implemented and covered by the Playwright credit-concurrency race suite. It serializes credit reads and writes per student for concurrent bookings, cancels, absences, and approvals.
- Enrollment plan selection already serializes plan selection per enrollment; only targeted regression coverage is needed.
- `POST /lessons` already debits one credit, checks sufficient balance, and refunds only lessons with a matching booking debit.
- The remaining work is active lesson collision enforcement, clear conflict responses for create/rebook/reschedule, safe handling of existing active duplicates, and refund consistency.
- The development database contains existing duplicate lesson groups. Migration safety is therefore a requirement, not an implementation detail.
- The active plan for credit-ledger serialization reports completion in its execute report while the plan metadata still remains active. This process drift is noted but the plan or folder will not be overwritten or archived as part of this SPEC.
- Rebook policy is explicitly excluded. This SPEC limits rebook work to rejecting any rebook that would create or retain an active teacher/time collision, without changing rebook debit or original-lesson behavior.
