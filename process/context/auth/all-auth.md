---
name: context:all-auth
description: "JWT + refresh-cookie auth, role scoping, and demo-vs-API mode — the auth group entrypoint/router"
keywords: auth, jwt, refresh token, cookie, login, roles, manager scope, demo mode, NEXT_PUBLIC_DEMO_MODE, isDemoMode, isApiDataMode, password
related: [context:all-database, context:all-uxui]
date: 24-11-26
---

# Auth Context

BLUF: Auth is custom (no Clerk/NextAuth): Fastify JWT access token (in memory on the client) + httpOnly refresh cookie, scrypt password hashes, four roles (admin, manager, teacher, student). The frontend runs in DEMO mode by default; real API auth only when `NEXT_PUBLIC_DEMO_MODE=false`. Keeping the two modes separate is a user-flagged care area.

Use this file after `process/context/all-context.md` for login, tokens, roles, scope, or mode-switching work.

## Scope

This group covers:

- Backend auth routes/plugin, token and cookie behavior
- Role model and manager/teacher/student scoping
- Frontend demo vs API mode flags and demo accounts

It does not cover: table definitions (see `process/context/database/`), UI layout (see `process/context/uxui/`).

## Read When

- changing `/auth/*` routes, JWT config, or password hashing
- adding an endpoint that needs role or team scoping
- touching `frontend/app/lib/auth/*`, `LoginScreen`, or anything gated by `isDemoMode()`/`isApiDataMode()`

## Quick Routing

- use `process/context/auth/jwt-cookie-flow.md` for tokens, refresh rotation, cookie settings, env vars, password change/reset, refresh-token revocation and pruning, auth rate limits, and the production CORS guard
- use `process/context/auth/roles-and-scope.md` for role guards and manager team scoping
- use `process/context/auth/demo-vs-api-mode.md` for mode flags, demo accounts, and keeping mock data out of API calls

## Source Paths

- `process/context/auth/jwt-cookie-flow.md`
- `process/context/auth/roles-and-scope.md`
- `process/context/auth/demo-vs-api-mode.md`
- Code: `backend/src/routes/auth.ts`, `backend/src/plugins/auth.ts`, `backend/src/lib/{roles,scope,password}.ts`, `frontend/app/lib/auth/`, `frontend/app/lib/api/`

## Update Triggers

- token TTLs, cookie flags, or refresh logic change
- a role is added/removed or scope rules change
- mode flags or demo accounts change

## Known Auth Gaps (open, in `process/features/launch-readiness/backlog/`)

- Access JWT stays valid up to 15 min after reset/change/pause/archive; `trustProxy` unconditional and per-process limiter store; no recovery path for a locked-out single admin and admin-on-admin reset has no step-up; shared fixed default password for admin-created accounts (HIGH, should-fix before launch); `/auth/refresh` and change-password are not fully atomic; no production cap on limiter env. Details: `jwt-cookie-flow.md` and the `*_NOTE_24-11-26.md` notes.

## Canonical Notes

- use `process/context/auth/all-auth.md` as the entrypoint
- Parents are not a login role; guardian data lives on `student_profiles`.
