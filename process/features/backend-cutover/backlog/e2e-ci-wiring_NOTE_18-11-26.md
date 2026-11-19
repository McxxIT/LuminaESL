---
name: note:e2e-ci-wiring
description: "Backlog: the Playwright parity suite runs only by hand; no CI job, no disposable test database"
date: 18-11-26
feature: backend-cutover
---

# Parity suite in CI

status: BLOCKED
item: D1-CI (from d1-parity-suite_PLAN_18-11-26, umbrella item "add ... to CI")
reason: The repo has no CI provider, no pipeline config, and no disposable test database. `npm run e2e` needs a migrated, seeded Postgres plus three free ports, so it cannot be bolted onto an existing pipeline because none exists.

## Gap

- `npm run e2e` is green twice back to back locally (Nov 18, 2026) but nothing runs it on push.
- The suite runs against the shared dev database and leaves rows behind on purpose (uploaded plan files, one booked lesson, one booked+cancelled lesson, one reviewed assignment, restored `notification_state`).
- Playwright writes `frontend/test-results/`, `frontend/playwright-report/`, and `frontend/blob-report/`; all three are gitignored and excluded from frontend ESLint.

See also `smoke-ci-and-fixtures_NOTE_18-11-26.md`, which records the same blocker for `npm run smoke` (no CI, no disposable database). Cross-linked rather than merged because that item is `done-with-gap` and this one is `BLOCKED`.

## Next step

NEW PLAN REQUIRED: add a CI job with a throwaway Postgres service, then:

```yaml
# shape only; pick the provider first
- uses: actions/setup-node@v4
  with: { node-version: 22, cache: npm }
- run: npm ci
- run: npm run db:migrate      # with DATABASE_URL + JWT_SECRET + UPLOAD_DIR in env
- run: npm run db:seed
- run: npm run e2e             # API config starts its own backend on :4000; demo config needs none
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: playwright-artifacts
    path: |
      frontend/playwright-report/
      frontend/test-results/
```

Constraints to keep:

- Set `CI=1` so the API config stops reusing an external backend (`reuseExistingServer: !process.env.CI`) and retries once per test.
- Playwright browsers are not cached in the repo; the job must run `npx playwright install --with-deps chromium` (the local suite reuses an already-installed Chromium 1255 for `1.65.1`).
- `UPLOAD_DIR` must point at a writable path inside the job, and the Postgres service must be local to the job so the smoke guards' local-host rules stay satisfied.
- Do not add `db:reset` or `db:push` to the job; `db:migrate` + `db:seed` on a fresh service database is enough.
