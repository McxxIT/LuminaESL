---
name: note:rebook-enrichment
description: "Backlog: rebook copies the original lesson's plan and room code instead of resolving the next plan"
date: 18-11-26
feature: backend-cutover
---

# Rebook enrichment

status: done-with-gap
item: B3-GAP-REBOOK-ENRICH (Public Contracts: "Rebook unchanged")
reason: The B3 plan kept rebook behavior unchanged; only booking and POST /lessons were enriched.

## Gap

`POST /lessons/:id/rebook` copies `enrollmentId`, `lessonPlanId`, and `roomCode` from the original lesson. The demo rebook goes through `createLesson`, which resolves the next plan and a fresh room code. Two scheduled lessons can therefore hold the same plan and room code in API mode.

## Next step

NEW PLAN REQUIRED: decide the intended rebook semantics (copy vs. next plan), then use `resolveLessonDefaults` in rebook or document the copy behavior; add a smoke assertion.
