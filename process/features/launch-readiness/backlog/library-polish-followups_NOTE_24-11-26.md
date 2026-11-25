---
name: note:library-polish-followups
description: "Backlog: library UI polish (390px material-chip clipping, Remove alignment, notification navigation/category, duplicated upload validators, API-mode visual probe)"
date: 24-11-26
feature: launch-readiness
---

# Library polish follow-ups

status: done (25-11-26, commit 5c1b4b9, Phase 05)
reason: Cosmetic or nit-level items found by the AC-11 demo-mode visual probe and the code review; none affect behavior.
item: Phase 04 review concern
priority: low

## Items

- At 390px the material name in the lesson materials chips is clipped and the Remove control is misaligned (`TeacherLessons`, `StudentLessons`, and the manager materials dialog).
- Library notifications have no navigation target and no mutable category in the bell.
- Upload size/type validation is duplicated between the library form and the plan-attachment form; extract one shared validator.
- API-mode visual probe of the Library tab and Materials dialog is still pending (AC-11 ran in demo mode only, desktop and 390px), together with Phase 03 P3-13.

## Resolution

Resolved 25-11-26 (Phase 05, commit `5c1b4b9`):

- 390px chip clipping fixed: the real defect was the material chip at 494px in a 390px viewport (tab rows did not overflow); `.lesson-material-files` is now a `grid minmax(0,1fr)` with `min-width:0`, file names ellipsize, and the compact-button indent resets at 480px and below. Remove alignment follows from the same change.
- Library notifications now navigate (Curriculum / Lessons).
- Upload validation is one shared `validateUploadFile` in `frontend/app/lib/school/files.ts`, used by `services/uploads.ts` and `services/library.ts` (messages byte-identical; `frontend/tests/uploads-validation.test.ts`).
- API-mode visual probe passed at 390px (Library tab, Materials dialog) together with Phase 03 P3-13 (password-change card, admin reset modal); screenshots not committed.
