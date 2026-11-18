---
name: spec:b3-domain-smoke
description: "Requirements for the final B3 item: repeatable API smoke per domain plus small local-vs-API parity fixes"
date: 18-11-26
feature: backend-cutover
---

# SPEC: B3 per-domain smoke and small parity fixes

## Summary

The frontend can run on a local browser store (demo mode) or on the real backend API. Today the two modes disagree in small ways, and nothing proves that each domain (bookings and slots, lessons, requests and approvals, credits, homework, quality, profile) works end to end against the real backend. This item adds one committed, re-runnable smoke script that exercises every domain through the API with allowed and denied roles and exact credit balances, and fixes the small gaps that make API mode behave differently from demo mode. The booking and credit race condition stays a documented known gap. Credits/billing and bookings are high-risk areas, so extra evidence is required later.

## User Stories / Jobs To Be Done

- As the developer, I want one command that checks every domain against the real backend, so I can trust the cutover without clicking through the app.
- As a student, I want a booked lesson to cost exactly 1 credit and a cancellation or teacher absence to give exactly 1 back, in both demo and real mode, so my balance is never wrong.
- As a student, I want my lesson rating saved to the backend in real mode, so it is not silently lost.
- As a manager, I want to be blocked from touching another manager's teachers, students, and requests, so team data stays private.
- As an admin, I want settings changes and every role's actions recorded in the activity log with consistent names, so audit history looks the same in both modes.
- As the developer, I want the smoke run to never wipe or reset my database, so I can run it any time safely.

## What The User Wants (Behavioral Outcomes)

- Running the smoke script starts a temporary backend on a spare port against the existing local Postgres, creates its own fresh test people and data, runs all checks, prints pass/fail per domain, and stops the backend.
- The script never resets, pushes schema to, or empties the database.
- Each mutation is checked for: the allowed role succeeds, disallowed roles get 403, a manager outside the owning team gets 403, and the expected activity entry exists.
- Credit-moving actions are checked for exact balance change: booking -1, cancel refund +1, teacher absence refund +1, approved lesson-cancel request refund +1; manual adjustments may be fractional.
- Demo mode uses 1 credit per lesson, matching the backend.
- Rating a lesson in real mode reaches the backend.
- Small parity gaps listed below are fixed; larger ones are recorded, not fixed.
- Browser checks stay manual/agent-run in both modes; results are logged in the cutover progress board.

## Flow / State Diagram

```
npm run smoke (name TBD)
   |
   v
start temp backend :4100 --> existing local Postgres (no reset/push/truncate)
   |
   v
create per-run fixtures (new users, slots, enrollment, credits)
   |
   v
for each domain: slots -> bookings -> lessons -> requests -> credits
                 -> homework -> quality/settings -> profile
   |     each mutation: allowed role OK | other roles 403 | cross-team manager 403
   |                    exact credit delta | activity row present
   v
print per-domain pass/fail --> stop backend --> exit code 0/1
   |
   v
agent runs browser checks (demo + API mode) --> log in CUTOVER_PROGRESS.md

Credit lifecycle (both modes, 1 credit per lesson):
 balance N --book--> N-1 --early cancel / teacher absence / approved cancel request--> N
                         \--student late cancel--> N-1 (no refund)
```

## Acceptance Criteria (Testable Outcomes)

Test grounding: the backend vitest suite is inject-only with no database, no Playwright, no fixtures. The smoke script is the new automated gate. Standing gates also apply: typecheck, lint, backend tests, `git diff --check`.

**A. Smoke harness**
1. One command runs the whole smoke against a temporary backend on a non-default port and exits non-zero on any failure.
   proven by: smoke self-run (green, and a deliberately broken run turns red); strategy: Fully-Automated
2. A second consecutive run also passes without manual cleanup (fixtures are fresh per run).
   proven by: two back-to-back runs; strategy: Fully-Automated
3. The script contains no call to reset, schema push, or truncate, and refuses to run against a production environment.
   proven by: grep gate on the script plus review; strategy: Fully-Automated
4. Results (commands, pass counts, date) are logged in the cutover progress board.
   proven by: progress doc diff review; strategy: Agent-Probe

**B. Bookings and slots**
5. Teacher opens and closes a slot; student and other-team manager get 403; activity recorded (slot opened/closed).
   proven by: smoke slots scenario; strategy: Fully-Automated
6. Student books an open slot: balance drops by exactly 1, slot removed, activity named `lesson.booked`. Booking the same slot again fails and balance does not drop a second time. Booking with 0 credits fails with no lesson created.
   proven by: smoke booking scenario; strategy: Fully-Automated
7. Manager/teacher books on behalf of a student: -1 on that student, own team only; cross-team manager gets 403.
   proven by: smoke on-behalf scenario; strategy: Fully-Automated
8. Rebook debits exactly 1 and works with fractional balances (1.5 allowed, 0.5 refused).
   proven by: smoke rebook scenario; strategy: Fully-Automated

**C. Lessons / teaching**
9. Schedule, reschedule, cancel, complete, and teacher-absence each give the right state, role allow/deny, activity entry, and exact refund (+1 on early student cancel and on teacher absence per settings; none on late student cancel).
   proven by: smoke lessons scenario; strategy: Fully-Automated
10. A cancelled lesson cannot be completed (rejected, state unchanged), matching demo mode.
    proven by: smoke lessons scenario; strategy: Fully-Automated
11. A booked lesson in API mode gets the same enrichment as demo (next lesson plan, enrollment link, room code) so the lesson page is not blank.
    proven by: smoke check on created lesson fields plus browser check; strategy: Hybrid

**D. Requests / approvals**
12. Teacher creates and withdraws a request; manager approves or rejects own-team requests only; cross-team manager gets 403; each decision logged.
    proven by: smoke requests scenario; strategy: Fully-Automated
13. Approving a lesson-cancellation request cancels the lesson and refunds exactly +1 once; approving a slot request affects the slot as in demo; approving against an already cancelled lesson does not refund again; a request naming a lesson that is not the teacher's own is rejected.
    proven by: smoke requests scenario; strategy: Fully-Automated
14. A lesson-cancellation request keeps its attachment in API mode.
    proven by: smoke request with attachment, read back; strategy: Fully-Automated

**E. Credits**
15. Student purchase works for self only (reason purchase); other students get 403. Manager/admin adjustment accepts fractional amounts and is own-team scoped for managers; balance equals the exact ledger sum.
    proven by: smoke credits scenario; strategy: Fully-Automated
16. Demo and API modes agree: 1 credit per lesson everywhere in the local store (booking, on-behalf, rebook, cancel refund, teacher absence/cancellation refund).
    proven by: typecheck/lint plus browser check in demo mode showing balance moves by 1; strategy: Hybrid

**F. Homework**
17. Teacher assigns, student submits (empty response rejected), teacher reviews; reviewing twice returns 400; cross-role and cross-team access denied; activity logged.
    proven by: smoke homework scenario; strategy: Fully-Automated

**G. Quality**
18. Student rates a completed lesson (1-5, one per source, duplicate 409, non-completed rejected); in API mode the app actually sends the rating to the backend. Only admin can change settings; out-of-range values rejected; settings change logged.
    proven by: smoke quality/settings scenario plus browser check of rating in API mode; strategy: Hybrid

**H. Profile**
19. Each of the 4 roles can rename themselves; renaming someone else is 403 for non-admins; a non-admin cannot change account status except a manager for own-team members.
    proven by: smoke profile scenario; strategy: Fully-Automated

**I. Activity naming**
20. Mutations that demo mode logs are logged in API mode under matching names (lesson booked, lesson rescheduled, slot opened, request created), with no duplicates or wrong names.
    proven by: smoke activity assertions per mutation; strategy: Fully-Automated

## Fix Classification

In scope (small, fixed in this item):
- Local credit unit changed to 1 per lesson (decision 1).
- API rating call added for lesson ratings.
- Complete-lesson blocked for cancelled lessons.
- Booking-created lesson enriched like demo (plan, enrollment, room code) [Open Question 2].
- Activity logging/naming parity: slot open/close, rebook, reschedule, request create/withdraw, lesson booked name (partly done in working tree).
- Lesson-cancellation request keeps its attachment.
- Request creation verifies the lesson belongs to that teacher.
- Approving a lesson-cancel request refunds only when the lesson is not already cancelled.
- Rebook and booking balance checks use exact numbers (no truncation of fractional credits).

Deferred / known gaps (documented, not fixed):
- No row lock on balance read/debit; two simultaneous bookings by one student can both pass.
- No uniqueness rule on lesson (teacher, date, time); only the slot claim prevents double-booking.
- No schema migration in this item.
- Curriculum Library, frontend automated tests, CI.

## Out Of Scope

- Fixing the concurrency/race known gap, or any schema change or migration.
- Playwright or any new browser-test dependency.
- Test database, fixture framework, or changes to db reset/seed behavior.
- Curriculum Library, uploads/notifications (Step C), parity/removal (Step D).
- UI redesign; broad "hours" wording changes (see Open Question 1).
- CI setup or hosting.

## Constraints

- 1 credit per lesson in both modes (user decision).
- Smoke is a committed script against a temporary backend (e.g. port 4100) on the existing local Postgres; never db:reset, db:push, or truncate; creates its own fixtures per run.
- Demo mode stays isolated from real API auth; mock data must not leak into API calls.
- Manager scoping must hold on every manager-reachable action.
- Dual-branch services: a change to one branch is mirrored in the other.
- The shared types contract with the backend test must stay in sync.
- High-risk classes: credits/billing and bookings need the manual-first evidence pack (vc-risk-evidence-pack) before closure.
- Local Windows dev, Postgres 15+, no CI. Do not depend on seed state that earlier runs may have consumed.

## Open Questions

1. UI copy: several screens say "credit hours" (e.g. manager schedule note, student billing/dashboard, admin settings). Change wording to credits/lessons now or in a later copy pass? Owner: user. Default: leave copy, list in backlog.
2. Booking enrichment: should API booking assign the next lesson plan and room code exactly like demo (a backend behavior change), or stay a separate teacher action? Owner: user. Default: match demo.
3. Smoke command name and location (root npm script vs backend script) and port. Owner: next phase (INNOVATE/PLAN).
4. Should approving a cancellation request on an already completed lesson be refused with no refund? Owner: user. Default: refuse.
5. Confirm smoke asserts no teacher-absence refund when `refundTeacherCancellations` is off (behavior already as designed). Owner: next phase.

## Background / Research Findings

- No repeatable smoke exists for any of the 7 domains; backend vitest tests are inject-only with no DB.
- Debit mismatch confirmed: backend debits -1 and refunds +1; local uses 25/60 via `LESSON_CREDIT_HOURS` (common.ts, used in bookings.ts and approvals.ts, also shown in ManagerSchedule).
- rateLesson has no API branch though the backend ratings route exists (student-only, completed lesson, 1-5, one per source, 409 on duplicate).
- Backend booking creates a bare "Booked lesson"; local assigns plan, provenance, and room code.
- Complete has no status guard in the backend; local blocks it.
- Activity, request, and refund gaps as listed in Fix Classification.
- Verified from routes this session: PATCH users allows self or admin; non-admin status change only for a manager's own team members. PATCH settings is admin-only with bounded ranges. Homework submit requires a non-empty response (1-8000 chars), matching local.
- Seed: 5 accounts, student Mia +12 credits, 2 slots, 1 enrollment, 1 completed and 1 scheduled lesson, 1 rating; manager2 has an empty team (handy for cross-team 403 checks), but fixtures must still be created fresh per run.
