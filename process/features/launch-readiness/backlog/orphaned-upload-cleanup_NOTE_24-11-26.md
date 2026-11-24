---
name: note:orphaned-upload-cleanup
description: "Backlog: unreferenced uploads and detached plan files are never cleaned up (including a failed library create after upload)"
date: 24-11-26
feature: launch-readiness
---

# Orphaned upload cleanup

status: done-with-gap (Phase 04 closed; this follow-up is still open, no fix scheduled)
reason: Uploads happen before the record that references them; a failed or abandoned second step leaves bytes and an `attachments` row behind.
item: Phase 04 known gap
priority: low

## Items

- A failed `POST /library` after `POST /uploads`, an abandoned plan attach, and detaching a plan file all leave unreferenced `attachments` rows and files under `UPLOAD_DIR`.
- Options: admin-only sweep script (unreferenced for more than N days, dry-run by default) or delete-on-detach. Never auto-delete without a dry-run report.
