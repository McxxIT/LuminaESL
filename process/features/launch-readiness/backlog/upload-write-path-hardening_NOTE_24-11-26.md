---
name: note:upload-write-path-hardening
description: "Backlog: harden the upload write path (Windows reserved device names, symlink-safe resolution, extname sanitising)"
date: 24-11-26
feature: launch-readiness
---

# Upload write-path hardening

status: done-with-gap (Phase 04 closed; this follow-up is still open, no fix scheduled)
reason: Download-side containment exists (`resolveUploadPath`, Step F); the write path still trusts the client filename extension and has no platform-quirk guard.
item: Phase 04 review concern
priority: medium

## Items

- Windows reserved device names (`CON`, `NUL`, `PRN`, `AUX`, `COM1`...) must never reach a stored filename. Keys are server-generated `{uuid}{ext}`, so the risk is the extension; assert it in a test.
- Sanitise `path.extname` of the client filename (length cap, allowlist `[a-z0-9]`, reject empty or trailing dots/spaces).
- Symlink-safe resolution: `resolveUploadPath` uses lexical containment; if `UPLOAD_DIR` could ever hold untrusted symlinks, add a `realpath` containment check.
- Files: `backend/src/routes/uploads.ts`, `backend/src/lib/upload-path.ts`, `backend/tests/upload-path.test.ts`.
