---
name: note:trust-proxy-and-limiter-store
description: "Backlog: trustProxy is unconditionally true and the rate-limit store is per-process, so IP-keyed limits are spoofable and not shared across instances"
date: 24-11-26
feature: launch-readiness
---

# Trust proxy and limiter store

status: done-with-gap (phase closed; this follow-up is still open, no fix scheduled)
reason: Depends on the Phase 06 deploy topology (reverse proxy or not).
item: Phase 03 known gap, adversarial scenario "X-Forwarded-For spoofing"
priority: medium (settle with the Phase 06 deploy topology)

## Gap

- `buildApp` sets `trustProxy: true` unconditionally. When the API is reachable without a trusted
  proxy in front, a client can send its own `X-Forwarded-For` and get a fresh IP bucket per request,
  which defeats every IP-keyed limiter (global, per-IP ceiling, login/refresh/change-password).
- `@fastify/rate-limit` uses its default in-memory LRU (5000 entries) per process. Multi-instance
  deploys do not share counters.

## Options

- Env-driven `TRUST_PROXY` (default `false`; hop count or CIDR list in production), documented in the
  Phase 06 compose/CI setup.
- A shared limiter store (Redis or Postgres) only if more than one API instance is deployed.

## Next step

Decide in Phase 06 (Docker Compose topology) whether a reverse proxy is the single entry point; if so
set `TRUST_PROXY` accordingly and assert it in the compose docs. A shared store is v1.1+.
