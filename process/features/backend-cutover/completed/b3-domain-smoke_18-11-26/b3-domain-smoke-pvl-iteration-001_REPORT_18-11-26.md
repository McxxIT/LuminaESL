---
name: b3-domain-smoke-pvl-iteration-001
domain: plan
iteration: 1
date: 2026-11-18
gate_before: CONDITIONAL
gaps_found: 9
fail_count: 0
concern_count: 9
applied: 9
---

# PVL iteration 001 — b3-domain-smoke

Input: first-pass validate-contract (outer-pvl), Gate: CONDITIONAL, 0 FAIL / 9 CONCERN.
Fix: vc-plan-agent PVL-supplement mode applied all 9 gaps to the plan; plan-artifact validator 0 failures.

| Gap | Section | Applied |
|---|---|---|
| 1 pgTypes `from: [1700]` + parser test | implementation-checklist B1/B2 | yes |
| 2 RATE_LIMIT_MAX in test Env literals | implementation-checklist B3 | yes |
| 3 missed 25/60 sites + SCHOOL_SCHEMA_VERSION 2→3 (both) | touchpoints F4/F6 | yes |
| 4 ActivityAction superset, rebook = lesson.booked, tx-capable logActivity | implementation-checklist B9/B11 | yes |
| 5 effective-teacher ownership check; pending-only approve | implementation-checklist B13/B14 | yes |
| 6 two-step attachment upload; temp UPLOAD_DIR; archive smoke admin | implementation-checklist F3/S1 | yes |
| 7 extended G-BROWSER-DEMO credit cases | verification-evidence | yes |
| 8 stale `::int` docs incl. booking-and-credit-integrity.md | touchpoints V5 | yes |
| 9 exact tsconfig/lint changes for scripts/ | implementation-checklist S5 | yes |

Extra: B5 reworded as refactor; GET /credits/balance string→number noted in Public Contracts.
Next: re-run vc-validate-agent from V1.
