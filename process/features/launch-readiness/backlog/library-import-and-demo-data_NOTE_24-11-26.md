---
name: note:library-import-and-demo-data
description: "Backlog: demo-mode library data is not carried by the one-time school import (accepted decision D7)"
date: 24-11-26
feature: launch-readiness
---

# Library data in the one-time import

status: done-with-gap (Phase 04 closed; accepted decision, revisit only if needed)
reason: User decision 24-11-26: the demo seed starts with an empty library and the import excludes library data.
item: Phase 04 known gap (D7)
priority: low

## Item

If a school ever builds a library in demo mode, extend `backend/src/lib/school-import.ts`, the import plan builder, and the browser capture (`frontend/app/lib/school/import/`) to carry `libraryItems`, `lessonLibraryItems`, and their attachment bytes. `SCHOOL_SCHEMA_VERSION` stays at 3 until then.
