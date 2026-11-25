# Lumina ESL

Monorepo for the Lumina ESL school platform.

```text
.
├── frontend/            # Next.js 16 App Router web app (existing UI)
│   ├── app/
│   ├── public/
│   ├── next.config.ts
│   └── package.json
├── backend/             # Fastify REST API (new)
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   ├── config/
│   │   ├── db/          # Drizzle schema, migrations, seed
│   │   ├── lib/
│   │   ├── plugins/
│   │   ├── routes/
│   │   └── types/
│   ├── tests/
│   ├── drizzle.config.ts
│   └── package.json
├── package.json         # npm workspaces + root scripts
└── package-lock.json
```

## Requirements

- Node.js 22+
- PostgreSQL 15+

## Setup

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` with your `DATABASE_URL` and a `JWT_SECRET` of at least 32
characters, then create the schema and demo data:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

`frontend/.env.local` sets `NEXT_PUBLIC_API_URL`. `NEXT_PUBLIC_DEMO_MODE`
defaults to `true` (browser-store demo login, any password). Set it to `false`
to sign in through `POST /auth/login` and restore sessions with the httpOnly
refresh cookie; school data still comes from the browser store until the
adapter cutover.

Run both apps:

```bash
npm run dev          # web on :3000, api on :4000
npm run dev:web
npm run dev:api
```

## Root scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Runs frontend and backend together |
| `npm run build` | Builds frontend and typechecks backend |
| `npm run typecheck` | Typechecks every workspace |
| `npm run lint` | Lints every workspace |
| `npm run test` | Runs backend tests |
| `npm run db:generate` | Generates Drizzle SQL migrations |
| `npm run db:migrate` | Applies migrations |
| `npm run db:seed` | Seeds demo accounts and content |
| `npm run db:reset` | **Destructive:** truncates all tables, then migrates and seeds (local only) |
| `npm run db:studio` | Opens Drizzle Studio |

## API

Base URL: `http://localhost:4000/api/v1` (`GET /health` sits at the root).

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/:id` |
| Students | `GET /students`, `GET/PATCH /students/:id` |
| Teachers | `GET /teachers`, `GET/PATCH /teachers/:id` |
| Courses | `GET/POST /courses`, `GET/PATCH/DELETE /courses/:id`, unit and lesson-plan sub-routes |
| Enrollments | `GET/POST /enrollments`, `PATCH /enrollments/:id` |
| Lessons | `GET/POST /lessons`, `GET/PATCH /lessons/:id`, `POST /lessons/:id/complete`, `POST /lessons/:id/ratings` |
| Bookings | `GET/POST /bookings/slots`, `DELETE /bookings/slots/:id`, `POST /bookings` |
| Requests | `GET/POST /requests`, `POST /requests/:id/review` |
| Assignments | `GET/POST /assignments`, `POST /assignments/:id/submit`, `POST /assignments/:id/review` |
| Credits | `GET /credits`, `GET /credits/balance/:studentId`, `POST /credits` |
| Notifications | `GET /notifications` |
| Uploads | `POST /uploads`, `GET /uploads/:id`, `GET /uploads/:id/download` |
| Settings | `GET/PATCH /settings` |

Authentication uses a short-lived JWT access token in the `Authorization:
Bearer <token>` header and an httpOnly refresh cookie scoped to
`/api/v1/auth`.

## Demo accounts

The API seed and the browser demo use the same accounts. After `npm run db:seed`,
every API account uses the password `Password123!`; the browser demo accepts any
non-empty password.

| Role | Name | Email |
| --- | --- | --- |
| Admin | Jamie Smith | `admin@lumina.school` |
| Manager | Priya Raman | `manager@lumina.school` |
| Manager | Marco Bianchi | `manager2@lumina.school` |
| Teacher | Alex Johnson | `teacher@lumina.school` |
| Student | Mia Chen | `student@lumina.school` |

The API seed creates these identities and their profile links only. The full
roster, courses, lessons, and history arrive with the data-adapter cutover
(`frontend/PROGRESS.md`).

`npm run db:reset` is destructive: it truncates every Lumina table, then runs
migrations and the seed. It refuses to run when `NODE_ENV=production`.

## Notes

- The frontend authenticates through `/auth/*` when `NEXT_PUBLIC_DEMO_MODE=false`
  (access token in memory, refresh cookie httpOnly). School data still comes from
  the browser-side store (`frontend/app/lib/school`); point it at
  `NEXT_PUBLIC_API_URL` and replace the store adapter module by module as
  endpoints come online.
- `uploads/` is git-ignored; files are stored on the API host for local
  development. Swap the upload service for object storage before production.
