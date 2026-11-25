---
name: note:lesson-plan-attach-hardening
description: "Backlog: legacy attachments.storage_key audit (1 suspect row), unvalidated PATCH /lessons lessonPlanId, school-import storageKey provenance, lesson_plans.attachment_ids lost-update race"
date: 24-11-26
feature: launch-readiness
---

# Plan-attach and lesson-plan hardening leftovers

status: done-with-gap (Phase 04 closed; this follow-up is still open, no fix scheduled)
reason: Step F closed the arbitrary-file-read hole at the plan-attach route and at download time; these residuals were deliberately left out of Phase 04.
item: Phase 04 known gap / review concern
priority: medium

## Items

1. **Legacy storage_key audit (read-only run 24-11-26, dev `lumina`):** 241 `attachments` rows; 240 match `{uuid}.{ext}`; **1 row does not** (id `427bf672-2f44-4d2b-896c-aec66688d562`; its storage_key contains a `/`; no backslash, colon, or `..`). Read-time containment (`resolveUploadPath`) already returns 404 if a key escapes `UPLOAD_DIR`. No row was changed. **Resolved 25-11-26 (see Resolution below): user decided to keep the row.**
2. **School-import `storageKey` provenance:** `backend/src/lib/school-import.ts` accepts a client-supplied `storageKey` from an admin; validate it against `{uuid}{ext}` or generate it server-side.
3. **`PATCH /lessons/:id` `lessonPlanId`:** accepted without validating that the plan exists, belongs to the lesson's course, or is in a usable status (`backend/src/routes/lessons.ts`, around lines 95 and 499). Reuse the validation `POST /lessons` applies.
4. **`lesson_plans.attachment_ids` lost-update race:** plan attach reads then writes the array, so two concurrent attaches can drop one id. Use a single `array_append` update or a row lock.
5. Add a smoke check for each item once fixed.

## Resolution of item 1 (suspect row, 25-11-26)

The orchestrator inspected row `427bf672-2f44-4d2b-896c-aec66688d562` read-only on 25-11-26: `storage_key` is `uploads/427bf672-...` (a doubled `uploads/` prefix), file `smoke.pdf`, uploaded 2026-11-17 by manager Priya Raman, referenced by no plan, library item, or request, no file on disk, and the key stays inside the upload directory. It is a harmless leftover of the old plan-attach route that accepted a client `storageKey` (closed in Phase 04 Step F). **User decision 25-11-26: keep the row.** No data was changed. Items 2 to 4 remain open.
