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

1. **Legacy storage_key audit (read-only run 24-11-26, dev `lumina`):** 241 `attachments` rows; 240 match `{uuid}.{ext}`; **1 row does not** (id `427bf672-2f44-4d2b-896c-aec66688d562`; its storage_key contains a `/`; no backslash, colon, or `..`). Read-time containment (`resolveUploadPath`) already returns 404 if a key escapes `UPLOAD_DIR`. No row was changed. **User decision needed:** inspect and delete or normalise that row, or accept it.
2. **School-import `storageKey` provenance:** `backend/src/lib/school-import.ts` accepts a client-supplied `storageKey` from an admin; validate it against `{uuid}{ext}` or generate it server-side.
3. **`PATCH /lessons/:id` `lessonPlanId`:** accepted without validating that the plan exists, belongs to the lesson's course, or is in a usable status (`backend/src/routes/lessons.ts`, around lines 95 and 499). Reuse the validation `POST /lessons` applies.
4. **`lesson_plans.attachment_ids` lost-update race:** plan attach reads then writes the array, so two concurrent attaches can drop one id. Use a single `array_append` update or a row lock.
5. Add a smoke check for each item once fixed.
