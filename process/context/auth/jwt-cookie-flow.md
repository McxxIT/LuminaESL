---
name: context:auth-jwt-cookie-flow
description: "Backend login/refresh/logout/me flow, JWT claims, refresh-cookie settings, password hashing, auth env vars"
keywords: jwt, access token, refresh token, cookie, httpOnly, login, register, logout, scrypt, ACCESS_TOKEN_TTL, JWT_SECRET, change password, reset password, rate limit, AUTH_RATE_LIMIT_MAX, CORS_ORIGIN, revoke, prune
related: [context:all-auth, context:auth-roles-and-scope]
date: 24-11-26
---

# JWT + Cookie Flow

BLUF: `POST /api/v1/auth/login` returns `{accessToken, user}` and sets an httpOnly `refresh_token` cookie. The client keeps the access token in memory only and refreshes through the cookie on 401.

## Backend (`backend/src/routes/auth.ts`, `backend/src/plugins/auth.ts`)

- Routes: `/register` (always creates role `student` + empty `student_profiles` row; 409 on duplicate email), `/login`, `/refresh`, `/logout`, `/me` (user + teacher/student profile), `/change-password`.
- Access JWT claims: `sub` (user id), `role`, `email`; TTL `ACCESS_TOKEN_TTL` (default 15m), secret `JWT_SECRET` (min 32 chars).
- Refresh token: 48 random bytes base64url; only its sha256 is stored in `refresh_tokens`. `/refresh` rotates: revokes the old row, issues a new one. Revoked/expired/inactive-user -> 401.
- Cookie: name `refresh_token`, path `/api/v1/auth`, httpOnly, sameSite lax, `secure` only when `NODE_ENV=production`, maxAge `REFRESH_TOKEN_TTL_DAYS` (default 30).
- `app.authenticate` = `jwtVerify`; `app.requireRole(roles)` = verify + role check (403). Failures use `AppError` shape `{error:{code,message}}`.
- Passwords: scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte salt) in `backend/src/lib/password.ts`; login checks `user.status === "active"`.
- Global rate limit 300/min (`@fastify/rate-limit`); CORS origins from `CORS_ORIGIN`.

### Password lifecycle (Phase 03, 24-11-26)

- **Policy:** `backend/src/lib/password.ts` `PASSWORD_MIN_LENGTH = 10`, `passwordSchema` is 10-128 characters, length only. Used by `/auth/register`, `POST /users`, change-password, and reset. `changePasswordSchema` rejects new == current; `resetPasswordSchema` is `.strict()` (only `newPassword`).
- **`POST /auth/change-password`** (authenticated): verifies the current password (wrong -> `400 INVALID_CURRENT_PASSWORD`, deliberately not 401 so the client does not refresh-loop and sign out), then one transaction (hash update + revoke all the user's refresh tokens), then `issueSession` (new rotated cookie for the calling device) and a `user.password_changed` activity row. Returns `{ success: true }`.
- **`POST /users/:id/reset-password`** (admin only): self-reset 400 (admin uses change-password), unknown id 404, transaction (update + revoke), `user.password_reset` activity, returns `{ id, success: true }`, never echoes the password. Known gap: an admin can reset another admin with no step-up.
- **Revocation helpers** (`backend/src/lib/refresh-tokens.ts`): `refreshCookieOptions(env)` (pure; the one source of cookie flags), `revokeUserRefreshTokens(db, userId)`, `pruneRefreshTokens(db, { userId?, now? })` (deletes expired rows and rows revoked more than `REVOKED_TOKEN_RETENTION_DAYS = 7` days ago). `PATCH /users/:id` (status away from `active`) and `DELETE /users/:id` also revoke. Prune runs per user on login/refresh (try/catch) plus an hourly fire-and-forget global sweep on login.
- **Access-token window (known gap):** access JWTs are stateless; after a reset, change, pause, or archive an already-issued access token works until `ACCESS_TOKEN_TTL` (15 min). Only refresh is cut. Backlog: `access-token-revocation_NOTE_24-11-26.md`.

### Auth rate limits and production guards

- Named limits: `/auth/login` keyed ip+email hash, `/auth/refresh` ip+cookie hash, `/auth/change-password` ip+`user.sub`; `max` is `AUTH_RATE_LIMIT_MAX` (default 30/min, `hook: "preHandler"`). A per-IP ceiling (`RATE_LIMIT_MAX`/min) runs first in each route via `app.createRateLimit`. Key generators are total (never throw; user-controlled parts capped and hashed).
- Test overrides: smoke (`backend/scripts/smoke.ts` `loadEnv`) and Playwright's backend env set `AUTH_RATE_LIMIT_MAX=100000`; any new env consumer in a test harness must too, or login volume hits 429.
- `envSchema.superRefine` (`backend/src/config/env.ts`) rejects empty, `*`, or non-http(s) `CORS_ORIGIN` when `NODE_ENV=production`; the `Secure` cookie flag also depends on `NODE_ENV=production`. No production cap exists on the limiter env values. Other open items: `trustProxy: true` is unconditional, limiter store is per-process, `sameSite: lax` breaks split-origin deploys. Backlog: `trust-proxy-and-limiter-store_NOTE_24-11-26.md`, `auth-rate-limit-config_NOTE_24-11-26.md` (in `process/features/launch-readiness/backlog/`).

## Frontend

- `frontend/app/lib/api/client.ts`: `request()` adds Bearer token, `credentials: include`, single-flight refresh on 401, then `setUnauthorizedHandler`. Base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).
- `frontend/app/lib/auth/session.ts`: external session store (`idle|loading|authenticated|anonymous`), `restoreSession()` from the refresh cookie, `signIn`, `signOut`. No token in localStorage.

## Gotchas

- Cross-origin dev needs `CORS_ORIGIN` to include the Next origin and cookies path-scoped to `/api/v1/auth`.
- Real passwords for seeded accounts: `Password123!` (see `database/seed-and-reset.md`).
- Accounts created by an admin/manager through the UI all get one shared fixed default password with no forced change on first login (pre-existing; HIGH backlog: `default-account-password_NOTE_24-11-26.md`). The value is deliberately not recorded in docs.
- Frontend: `changePassword()` in `frontend/app/lib/api/auth.ts`; `PasswordChangeCard` (shared component) is mounted in the admin, manager, teacher, and student Settings screens and renders a static "Demo mode" explainer in demo mode (no form, no API call). `ResetPasswordModal` (`PeopleForms.tsx`) is admin-only and `!isDemoMode()`.
