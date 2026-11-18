---
name: note:frontend-test-runner
description: "Backlog: frontend local-branch parity is proven only by agent probes (no frontend test runner)"
date: 18-11-26
feature: backend-cutover
---

# Frontend test runner (residual R1)

status: done-with-gap
item: B3-R1 (validate-contract residual R1, user-accepted)
reason: The frontend has no test runner, so demo/local-branch rules can only be checked by agent browser or service probes.

## Gap

Local-branch behavior changed in B3 (1 credit per lesson, approve-cancel refuses completed lessons, homework re-review refused, API rating and attachment upload paths) has no repeatable automated gate. B3 used a one-off Node probe that drives the real local services on a memory store (`createMemoryAdapter`) plus Chromium checks.

## Next step

NEW PLAN REQUIRED: add vitest to `@lumina/frontend` and turn the B3 probe (memory-adapter store + services) into committed tests for bookings, approvals, credits, homework, and quality.
