---
name: note:library-polish-followups
description: "Backlog: library UI polish (390px material-chip clipping, Remove alignment, notification navigation/category, duplicated upload validators, API-mode visual probe)"
date: 24-11-26
feature: launch-readiness
---

# Library polish follow-ups

status: carry-in to Phase 05 polish
reason: Cosmetic or nit-level items found by the AC-11 demo-mode visual probe and the code review; none affect behavior.
item: Phase 04 review concern
priority: low

## Items

- At 390px the material name in the lesson materials chips is clipped and the Remove control is misaligned (`TeacherLessons`, `StudentLessons`, and the manager materials dialog).
- Library notifications have no navigation target and no mutable category in the bell.
- Upload size/type validation is duplicated between the library form and the plan-attachment form; extract one shared validator.
- API-mode visual probe of the Library tab and Materials dialog is still pending (AC-11 ran in demo mode only, desktop and 390px), together with Phase 03 P3-13.
