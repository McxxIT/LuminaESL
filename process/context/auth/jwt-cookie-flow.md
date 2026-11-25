---
name: context:auth-jwt-cookie-flow
description: "Backend login/refresh/logout/me flow, JWT claims, refresh-cookie settings, password hashing, auth env vars"
keywords: jwt, access token, refresh token, cookie, httpOnly, login, register, logout, scrypt, ACCESS_TOKEN_TTL, JWT_SECRET
related: [context:all-auth, context:auth-roles-and-scope]
date: 17-11-26
---

# JWT + Cookie Flow

BLUF: `POST /api/v1/auth/login` returns `{accessToken, user}` and sets an httpOnly `refresh_token` cookie. The client keeps the access token in memory only and refreshes through the cookie on 401.

## Backend (`backend/src/routes/auth.ts`, `backend/src/plugins/auth.ts`)

- Routes: `/register` (always creates role `student` + empty `student_profiles` row; 409 on duplicate email), `/login`, `/refresh`, `/logout`, `/me` (user + teacher/student profile).
- Access JWT claims: `sub` (user id), `role`, `email`; TTL `ACCESS_TOKEN_TTL` (default 15m), secret `JWT_SECRET` (min 32 chars).
- Refresh token: 48 random bytes base64url; only its sha256 is stored in `refresh_tokens`. `/refresh` rotates: revokes the old row, issues a new one. Revoked/expired/inactive-user -> 401.
- Cookie: name `refresh_token`, path `/api/v1/auth`, httpOnly, sameSite lax, `secure` only when `NODE_ENV=production`, maxAge `REFRESH_TOKEN_TTL_DAYS` (default 30).
- `app.authenticate` = `jwtVerify`; `app.requireRole(roles)` = verify + role check (403). Failures use `AppError` shape `{error:{code,message}}`.
- Passwords: scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte salt) in `backend/src/lib/password.ts`; login checks `user.status === "active"`.
- Global rate limit 300/min (`@fastify/rate-limit`); CORS origins from `CORS_ORIGIN`.

## Frontend

- `frontend/app/lib/api/client.ts`: `request()` adds Bearer token, `credentials: include`, single-flight refresh on 401, then `setUnauthorizedHandler`. Base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).
- `frontend/app/lib/auth/session.ts`: external session store (`idle|loading|authenticated|anonymous`), `restoreSession()` from the refresh cookie, `signIn`, `signOut`. No token in localStorage.

## Gotchas

- Cross-origin dev needs `CORS_ORIGIN` to include the Next origin and cookies path-scoped to `/api/v1/auth`.
- Real passwords for seeded accounts: `Password123!` (see `database/seed-and-reset.md`).
