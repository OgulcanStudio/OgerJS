# Enterprise roadmap (Bun-native)

OgerJS targets Bun-native enterprise APIs: `Bun.serve({ routes })`, `bun:sqlite`, Bun Redis, WebSocket pub/sub, `Bun.password`, and `bun:test` — with zero runtime npm deps in `@ogerjs/core`.

## Shipped in v0.1.0

**29** `@ogerjs/*` workspace packages are published in this release. Authoritative list: [OVERVIEW.md](./OVERVIEW.md#package-table).

| Area | Shipped packages |
|------|------------------|
| Core | `core`, `router`, `testing`, `create-oger` |
| Security | `cors`, `helmet`, `csrf`, `jwt`, `basic-auth`, `bearer`, `api-key`, `body-limit`, `cookie` |
| HTTP | `json`, `html`, `compress`, `etag`, `static`, `stream`, `upload` |
| Ops | `logger`, `request-id`, `health`, `audit-log`, `rate-limit`, `idempotency` |
| Real-time | `sse`, `ws`, `events` |
| Runtime | `compat` |

Reference enterprise stack: `apps/example-banking` — [BANKING.md](./BANKING.md).

> Tables below track **planned** capabilities. Rows marked **Done** may refer to packages not yet included in v0.1.0 — check [OVERVIEW.md](./OVERVIEW.md) before importing.

## Gap analysis (planned capabilities)

| # | Capability | Status | Package / notes |
|---|------------|--------|-----------------|
| 1 | Adaptive rate limiting | **Partial** | `@ogerjs/rate-limit` — `AdaptiveLimiter`, `adaptive` option on `rateLimit()` |
| 2 | Bot protection | **Partial** | `@ogerjs/bot-guard` — UA heuristics, allow/deny, fingerprint hook, challenge HTML |
| 3 | Secure headers presets | **Partial** | `@ogerjs/helmet` — `helmetApiPreset`, `helmetDashboardPreset`, `helmetAdminPreset`, `helmetPublicWebsitePreset` |
| 4 | CORS policy builder | **Partial** | `@ogerjs/cors` — `buildCorsPolicy()`, `validateCorsPolicy()` |
| 5 | CSRF protection | **Done** | `@ogerjs/csrf` |
| 6 | Request body size limits | **Partial** | `@ogerjs/body-limit` — global + `rules` per path/content-type/tenant |
| 7 | File upload engine | **Partial** | `@ogerjs/upload` — multipart parse, MIME allow-list, SHA-256, `virusScan` hook |
| 8 | Static file serving | **Partial** | `@ogerjs/static` — cache-control, immutable, weak ETag, range header |
| 9 | Large response streaming | **Partial** | `@ogerjs/stream` — file, NDJSON, CSV, line streams |
| 10 | SSE helper | **Partial** | `@ogerjs/sse` — `createSseResponse`, `sseHandler` |
| 11 | WebSocket router | **Partial** | `@ogerjs/ws` — `matchWebSocketRoute`, `createWebSocketRouter` |
| 12 | Bun WebSocket pub/sub | **Partial** | `@ogerjs/ws` — `TopicPubSub` (in-process) |
| 13 | Typed WS client generator | **Scaffold** | `@ogerjs/ws` — `scaffoldWebSocketClient()` |
| 14 | Presence module | **Partial** | `@ogerjs/presence` — rooms, typing, heartbeat eviction |
| 15 | Background jobs | **Partial** | `@ogerjs/jobs` — queue, retry/DLQ, plugin poll |
| 16 | Bun worker tasks | **Missing** | Wire `Worker` from app code; package hook TBD |
| 17 | Scheduler | **Partial** | `@ogerjs/jobs` — `createScheduler()` (delay/recurring ms; cron TBD) |
| 18 | Outbox pattern | **Scaffold** | `@ogerjs/events` — in-memory `Outbox` |
| 19 | Event bus | **Partial** | `@ogerjs/events` — in-memory adapter + interfaces |
| 20 | Typed domain events | **Partial** | `@ogerjs/events` — `defineDomainEvent()` |
| 21 | Repository / query layer | **Partial** | `@ogerjs/data` — `InMemoryRepository`, `QueryBuilder` |
| 22 | Database adapters | **Partial** | `@ogerjs/data` — `DbAdapter` interface, `createSqliteAdapter()` stub |

### Phase 1 foundations (unchanged)

| # | Capability | Status |
|---|------------|--------|
| — | Bun.serve adapter | **Done** |
| — | Zero-dep core | **Done** |
| — | RFC 7807 errors | **Done** |
| — | Route registry / metadata | **Partial** |
| — | DI scopes | **Partial** |
| — | Contract / plugin / module scaffolds | **Partial** |

## Bun.serve adapter

`app.listen()` calls `Bun.serve({ port, hostname, routes, fetch, tls, development })`:

- Matched paths are served from compiled `routes`.
- `fetch` handles unmatched URLs (RFC 7807 404).
- `app.reload()` hot-swaps `routes` after re-`compile()`.

## Recommended next order

1. Bun Redis / `bun:sqlite` adapters for rate-limit, sessions, event bus
2. Cron expression scheduler + `Bun.Worker` job runner helper
3. Streaming multipart upload + virus-scan integration examples
4. WebSocket auth middleware + room validation on `createWebSocketRouter`
5. Persisted outbox + transactional relay
6. OpenAPI → typed client (HTTP + WS)

## Blockers

- Distributed rate limit / pub/sub need adapter packages (Redis) — interfaces only in-repo today.
- Full cron and WS client codegen need Phase 3 design.

## Feature batch — observability, testing, ops (2026)

| # | Capability | Status | Package / notes |
|---|------------|--------|-----------------|
| 1 | OpenTelemetry spans | **Partial** | `@ogerjs/otel` — request + per-route handler spans; OTLP exporter TBD |
| 2 | Audit log | **Done** | `@ogerjs/audit-log` — auth/admin/data/permission/security events |
| 3 | Privacy-safe logging | **Done** | `@ogerjs/logger` — `redact()`, `redactLogLine()`, structured payload hook |
| 4 | Performance profiler | **Done** | `@ogerjs/profiler` — route/handler timing, memory delta, response size |
| 5 | Route benchmark | **Done** | `@ogerjs/testing` — `benchRoute()` via `inject()` |
| 6 | `app.inject()` | **Done** | `@ogerjs/core` — `inject()`, `buildInjectRequest()` |
| 7 | Contract test generator | **Partial** | `@ogerjs/testing` — `generateContractTests()`, smoke runner |
| 8 | Mock service container | **Done** | `@ogerjs/testing` + `@ogerjs/core` `createTestContainer()` |
| 9 | Snapshot helpers | **Partial** | `@ogerjs/testing` — `snapshotJson()`, `snapshotOpenApi()` |
| 10 | CLI project generator | **Partial** | `create-oger` — `--template api|auth|microservice` |
| 11 | Feature generator CLI | **Partial** | `create-oger --feature <name>` scaffold |
| 12 | Plugin generator CLI | **Partial** | `create-oger --plugin <name>` scaffold |
| 13 | Single-file executable | **Deferred** | Bun bundler preset — docs TBD |
| 14 | Deployment presets | **Deferred** | Docker/K8s/systemd templates — docs TBD |
| 15 | Production readiness checker | **Partial** | `@ogerjs/readiness` — env/secrets/TLS/CORS/rate-limit/health checks |
| 16 | Health checks | **Done** | `@ogerjs/health` — liveness, readiness, startup, custom checks |
| 17 | Graceful shutdown | **Partial** | `@ogerjs/shutdown` + core `listen()` SIG hooks |
| 18 | Maintenance mode | **Done** | `@ogerjs/maintenance` — JSON/HTML, admin bypass header |
| 19 | Admin dashboard plugin | **Deferred** | Use `@ogerjs/html` `dashboardLayout()` + metrics/health routes |
| 20 | Route explorer dashboard | **Deferred** | OpenAPI UI covers MVP; typed explorer TBD |
| 21 | Built-in API docs | **Partial** | `@ogerjs/openapi` — raw JSON, Swagger UI, Scalar, Redoc |
| 22 | Schema adapter layer | **Partial** | `@ogerjs/core` — `fromStandardSchema()`, `adaptValidator()`, TypeBox-like helper |
| 23 | Response serialization | **Done** | `@ogerjs/core` — `safeStringify()`, `fastStringify()` |
| 24 | Content negotiation | **Partial** | `@ogerjs/negotiate` — JSON/HTML/XML/CSV/text/msgpack |
| 25 | HTML/template module | **Partial** | `@ogerjs/html` — `dashboardLayout()`, `tableFromRows()`, `metricCard()` |

## Feature batch 2 — DX, reliability, SaaS (2026)

| # | Capability | Status | Package / notes |
|---|------------|--------|-----------------|
| 1 | HTMX helpers | **Done** | `@ogerjs/htmx` — partial, redirect, trigger, validation HTML |
| 2 | Edge-compatible subset mode | **Partial** | `@ogerjs/core` `setRuntimeMode("edge")` + `@ogerjs/compat` |
| 3 | Bun-only enhanced mode | **Partial** | `setRuntimeMode("bun-enhanced")`, `warnIfBunOnly()` |
| 4 | Compatibility warnings | **Done** | `@ogerjs/compat`, core `warnIfBunOnly()` |
| 5 | Request replay recorder | **Done** | `@ogerjs/replay` — redacted capture + `replayToRequest()` |
| 6 | Chaos testing middleware | **Done** | `@ogerjs/chaos` — latency, errors, DB/Redis simulate headers |
| 7 | Circuit breaker | **Done** | `@ogerjs/circuit-breaker` |
| 8 | Retry + timeout wrapper | **Done** | `@ogerjs/http-client` `fetchWithRetry()` |
| 9 | Typed HTTP client | **Partial** | `@ogerjs/http-client` — auth, breaker, JSON helper |
| 10 | Webhook framework | **Partial** | `@ogerjs/webhook` — HMAC verify, replay guard, in-memory store, UI |
| 11 | Idempotency-key middleware | **Done** | `@ogerjs/idempotency` |
| 12 | Request deduplication | **Partial** | `@ogerjs/idempotency` `dedupeConcurrent()` |
| 13 | Cache middleware | **Partial** | `@ogerjs/cache` — memory backend, tags, Redis interface stub |
| 14 | Response compression rules | **Partial** | `@ogerjs/compress` `pathRules` |
| 15 | ETag per-route rules | **Partial** | `@ogerjs/etag` `pathRules` |
| 16 | API quota system | **Partial** | `@ogerjs/quota` — plans, tenant header |
| 17 | Billing usage meter hooks | **Done** | `@ogerjs/billing` `recordUsage()` |
| 18 | Feature flags | **Done** | `@ogerjs/flags` |
| 19 | A/B testing middleware | **Done** | `@ogerjs/ab-test` |
| 20 | Local dev inspector | **Done** | `@ogerjs/inspector` |
| 21 | Hot reload plugin system | **Partial** | `@ogerjs/hot-reload` — `reload()` hook |
| 22 | Framework doctor command | **Done** | `create-oger --doctor`, `oger-doctor` bin |
| 23 | AI-agent manifest JSON | **Done** | `@ogerjs/manifest` `buildAgentManifest()` |
| 24 | Auto doc generator | **Done** | `@ogerjs/docgen` `generateDocsMarkdown()` |
| 25 | Architecture rules engine | **Partial** | `@ogerjs/architect` — source-level checks |
| 26 | Enterprise preset | **Done** | `@ogerjs/presets` `enterprisePreset()` |
| 27 | Minimal preset | **Done** | `minimalPreset()` |
| 28 | SaaS preset | **Partial** | `saasPreset()` — quota + api-key macro |
| 29 | Microservice preset | **Done** | `microservicePreset()` |
| 30 | Plugin marketplace metadata | **Done** | `definePluginMarketplaceMeta()` in `@ogerjs/presets` |
