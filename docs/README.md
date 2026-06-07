# OgerJS Documentation

Guides for building, securing, deploying, and benchmarking HTTP services with OgerJS.

**Release: v0.2.0** · **Bun >= 1.2.3** · Node.js 18+ via `@ogerjs/compat`

> **Package scope:** This release ships **29** `@ogerjs/*` workspace packages. Guides that mention packages such as `@ogerjs/openapi`, `@ogerjs/metrics`, or `@ogerjs/jobs` describe the [roadmap](./ENTERPRISE_ROADMAP.md) unless marked as shipped in [OVERVIEW.md](./OVERVIEW.md).

## Start here

| Guide | Audience | Contents |
|-------|----------|----------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | All developers | Install, first app, plugins, testing |
| [OVERVIEW.md](./OVERVIEW.md) | Architects | Monorepo layout, **v0.2.0 package map** |
| [CORE.md](./CORE.md) | Backend engineers | `Oger` class, context, lifecycle, DI |
| [ROUTING.md](./ROUTING.md) | API developers | Verbs, groups, guards, macros |
| [VALIDATION.md](./VALIDATION.md) | API developers | `t` schemas, inference, 422 errors |
| [PLUGINS.md](./PLUGINS.md) | Platform teams | Plugin authoring, composition |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | All developers | RFC 7807 problems, hooks |
| [TESTING.md](./TESTING.md) | QA / backend | `app.inject()`, plugin contracts |
| [BENCHMARKS.md](./BENCHMARKS.md) | Performance | HTTP benchmark methodology |

## Security and compliance

| Guide | Contents |
|-------|----------|
| [SECURITY.md](./SECURITY.md) | Helmet, CORS, CSRF, rate limits (shipped plugins) |
| [AUTH.md](./AUTH.md) | JWT, Basic, Bearer, API keys, `defineAuthPlugin` |
| [ENTERPRISE.md](./ENTERPRISE.md) | Audit, idempotency, rate limits in production |

## Production and operations

| Guide | Contents |
|-------|----------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Bun/Node deploy, TLS, graceful shutdown |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Health, events, static files, compat, scaffolding |
| [COMPATIBILITY.md](./COMPATIBILITY.md) | Cross-runtime SQLite, crypto, compression |
| [CONTENT_SERIALIZATION.md](./CONTENT_SERIALIZATION.md) | JSON, streams, compression |
| [OPENAPI.md](./OPENAPI.md) | Route registry export (v0.2.0); full OpenAPI UI on roadmap |
| [DI_MODULES.md](./DI_MODULES.md) | Modules, controllers, scoped DI |

## Reference applications

| App | Doc |
|-----|-----|
| `apps/example-basic` | Minimal routes + validation |
| `apps/example-auth` | [AUTH.md](./AUTH.md) patterns |
| `apps/example-banking` | [BANKING.md](./BANKING.md) — enterprise stack + `/openapi.json` |

## Advanced and roadmap

| Guide | Contents |
|-------|----------|
| [ADVANCED.md](./ADVANCED.md) | DI, SSE/WebSocket, testing utilities |
| [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md) | Capability matrix, planned packages, gaps |
