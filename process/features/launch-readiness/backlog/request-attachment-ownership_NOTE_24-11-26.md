---
name: note:request-attachment-ownership
description: "Backlog: POST /requests stores any client-supplied attachmentId without an ownership check"
date: 24-11-26
feature: launch-readiness
---

# Request attachment ownership

status: done-with-gap (Phase 04 closed; this follow-up is still open, no fix scheduled)
reason: Verified at UPDATE PROCESS 24-11-26: `backend/src/routes/requests.ts` line 39 accepts an optional uuid and line 148 inserts it as-is. The foreign key proves the attachment exists, not that the requester uploaded it.
item: Phase 04 known gap
priority: medium

## Problem

A teacher or manager filing a request can cite any existing attachment id. `canAccessAttachment` grants download access from request evidence (the Phase 02 path), so citing another user's attachment id could widen access to that file.

## Fix options

- Require `attachments.uploaded_by = request.user.sub` (or admin) when `attachmentId` is present; return 422 otherwise.
- Add a smoke check for the denial case.
