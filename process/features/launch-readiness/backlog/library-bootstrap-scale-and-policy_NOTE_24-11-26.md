---
name: note:library-bootstrap-scale-and-policy
description: "Backlog: library bootstrap size/pagination, manager unarchive of an admin-archived item, no AV or content sniffing on distributed files"
date: 24-11-26
feature: launch-readiness
---

# Library scale and policy questions

status: done-with-gap (Phase 04 closed; this follow-up is still open, no fix scheduled)
reason: Fine at school scale; decide before a large or multi-school rollout.
item: Phase 04 known gaps
priority: low

## Items

- **Bootstrap size:** `GET /school/bootstrap` returns every library item and link visible to the role; add pagination or lazy loading if the library grows past a few hundred items.
- **Policy question:** may a manager unarchive an item that an admin archived? Today edit/archive is creator-or-admin; confirm the intended rule and add a smoke check.
- **Content safety:** files distributed to students are checked only by extension, MIME, and the 5 MB cap; there is no antivirus or magic-byte sniffing.
- **Accepted, no action:** creator names (`createdByName`) are visible to all managers (user decision 24-11-26).
