# OgerJS — Overview

Bun-native HTTP framework monorepo with fluent macro ergonomics, zero-dependency core, native `Bun.serve({ routes })` routing, composable plugins, `t` schema validation, and lifecycle hooks.

**Release v0.1.0** · **Bun >= 1.2.3**

## Architecture

OgerJS is a Bun workspace monorepo:

| Path | Role |
|------|------|
| `packages/*` | **29** `@ogerjs/*` packages — core + opt-in plugins |
| `apps/*` | Reference applications (`example-basic`, `example-auth`, `example-banking`, `bench`) |
| `benchmark/` | Go HTTP comparison harness (OgerJS, Hono, Elysia, Express, vanilla) |
| `docs/` | Guides (this folder) |
| `scripts/` | `build.ts` and maintenance scripts |

`@ogerjs/core` has **zero runtime npm dependencies**. Plugins compose via `.use()` and are validated by `@ogerjs/testing` contract tests.

```
                    ┌─────────────────┐
                    │  @ogerjs/core   │
                    │  Oger, t, DI    │
                    └────────┬────────┘
                             │ .use()
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   Security plugins    HTTP / content      Ops plugins
   cors, helmet, jwt   static, stream      logger, health
```

Planned packages (OpenAPI UI, metrics, jobs, cache, etc.) are tracked in [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md).

## Quickstart

```bash
bun add @ogerjs/core
```

```ts
import { Oger, t } from "@ogerjs/core";

const app = new Oger()
  .get("/", () => "Hello OgerJS")
  .get("/users/:id", ({ params }) => getUser(params.id))
  .post("/users", ({ body }) => createUser(body), {
    body: t.Object({ name: t.String({ minLength: 1 }) }),
  })
  .listen(3000);
```

## Core features (shipped)

| Feature | Description |
|---------|-------------|
| **Routing** | `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.options()`, `.head()`, `.all()` with `:param` / `*` patterns |
| **Validation** | Built-in `t` schemas, `Static<T>` inference, RFC 7807 422 responses |
| **Lifecycle** | `onRequest`, `parse`, `transform`, `beforeHandle`, `afterHandle`, `mapResponse`, `onError`, `onAfterResponse`, `onStart`, `onStop` |
| **Plugins** | `.use()` mounting; dedupe via `name` + `seed` |
| **Macros** | Route-level flags wiring schemas and hooks |
| **Modules & DI** | `defineModule()`, `defineController()`, scoped containers |
| **Contracts** | `defineContract()`, `assertContractHandlers()` |
| **Guards** | `.guard()` — shared schema + hooks for route groups |
| **Route registry** | `app.routeRegistry` — compile-time metadata for docs and tooling |
| **Testing** | `app.inject()` / `app.handle()` — no socket |
| **Hot reload** | `app.reload()` — recompile and swap `Bun.serve` routes |
| **Cross-runtime** | Bun native + Node `http`/`https` fallback; `@ogerjs/compat` helpers |

## Package table

### Core and tooling

| Package | Description |
|---------|-------------|
| `@ogerjs/core` | Framework: routing, lifecycle, `t`, macros, DI, modules, `inject()` |
| `@ogerjs/router` | Standalone trie router (used internally and for benchmarks) |
| `@ogerjs/testing` | Plugin contract harness, `benchRoute()`, snapshot helpers |
| `create-oger` | Project scaffold CLI (`bunx create-oger`, `oger-doctor`) |

### Security

| Package | Description |
|---------|-------------|
| `@ogerjs/cors` | CORS with strict origin allowlist and policy builder |
| `@ogerjs/helmet` | Security response headers and deployment presets |
| `@ogerjs/csrf` | Double-submit CSRF protection |
| `@ogerjs/jwt` | JWT sign/verify (HS256) + bearer macro |
| `@ogerjs/basic-auth` | HTTP Basic authentication |
| `@ogerjs/bearer` | Bearer token extraction |
| `@ogerjs/api-key` | API key header validation macro |
| `@ogerjs/body-limit` | Reject oversized bodies via `Content-Length` and rules |
| `@ogerjs/cookie` | Cookie parse/set with signing and encryption options |

### Request and response

| Package | Description |
|---------|-------------|
| `@ogerjs/json` | JSON response helpers |
| `@ogerjs/html` | HTML layout and table helpers |
| `@ogerjs/compress` | Gzip response compression |
| `@ogerjs/etag` | ETag generation and `304 Not Modified` |
| `@ogerjs/static` | Static file serving with traversal protection |
| `@ogerjs/stream` | Streaming file, NDJSON, CSV utilities |
| `@ogerjs/upload` | Multipart upload parsing and validation hooks |

### Observability and enterprise

| Package | Description |
|---------|-------------|
| `@ogerjs/logger` | Structured request logging with redaction |
| `@ogerjs/request-id` | Propagate or generate `X-Request-ID` |
| `@ogerjs/health` | Liveness, readiness, and startup probes |
| `@ogerjs/audit-log` | Structured audit trail events |
| `@ogerjs/rate-limit` | Per-key rate limiting with adaptive mode |
| `@ogerjs/idempotency` | Idempotent POST handling and deduplication |

### Real-time and events

| Package | Description |
|---------|-------------|
| `@ogerjs/sse` | Server-Sent Events helpers |
| `@ogerjs/ws` | WebSocket routing for `Bun.serve` |
| `@ogerjs/events` | In-memory event bus, domain events, transactional outbox |

### Runtime compatibility

| Package | Description |
|---------|-------------|
| `@ogerjs/compat` | Runtime mode, Bun-only warnings, Node shims (crypto, sqlite, gzip, files) |

## Conventions

- **Fluent builder** — methods return `this` for chaining
- **Workspaces** — `bun test packages`, `bun run build`, `bun run typecheck`
- **Plugins** — `definePlugin(meta, setup)`; scoped plugins via `defineScopedPlugin*`
- **Errors** — RFC 7807 `application/problem+json`
- **Validation failures** — HTTP 422 with structured `issues`
- **Types** — `Static<T>` inference from `t` schemas

## Development commands

```bash
bun install
bun test packages
bun run typecheck
bun run build
bunx create-oger my-app --yes
bun run --cwd apps/example-banking test
```

## Next guides

[ROUTING.md](./ROUTING.md) · [VALIDATION.md](./VALIDATION.md) · [CORE.md](./CORE.md) · [ERROR_HANDLING.md](./ERROR_HANDLING.md) · [PLUGINS.md](./PLUGINS.md) · [BANKING.md](./BANKING.md)
