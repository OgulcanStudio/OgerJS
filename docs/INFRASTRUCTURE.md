# Infrastructure

**v0.1.0** ships infrastructure plugins for **events**, **health probes**, **static files**, **runtime compatibility**, and **project scaffolding**. Caching, metrics, OpenTelemetry, readiness audits, and full OpenAPI UI are on the [roadmap](./ENTERPRISE_ROADMAP.md).

## Events

`@ogerjs/events` — typed domain events, in-memory bus, transactional outbox:

```ts
import { defineDomainEvent, createInMemoryEventBus, Outbox } from "@ogerjs/events";

const UserCreated = defineDomainEvent<"user.created", { email: string }>();
const event = UserCreated("user.created", { email: "a@b.com" });

const bus = createInMemoryEventBus();
bus.subscribe("users", (e) => console.log(e.payload));
bus.publish("users", event);

const outbox = new Outbox();
outbox.add("users", event);
outbox.drainUnpublished();
```

## Health checks

`@ogerjs/health` — liveness, readiness, and startup probes:

```ts
import { health, diskCheck } from "@ogerjs/health";

app.use(health({
  livenessPath: "/health/live",
  startupPath: "/health/startup",
  readinessPath: "/health/ready",
  checks: [
    diskCheck(),
    { name: "db", check: async () => ({ ok: true, detail: "connected" }) },
  ],
}));
```

## Static files

`@ogerjs/static` — directory serving with traversal protection, cache headers, weak ETag, range requests:

```ts
import { staticPlugin } from "@ogerjs/static";

app.use(staticPlugin({
  assets: "./public",
  prefix: "/",
  cacheControl: "public, max-age=3600",
  immutable: true,
  rangeRequests: true,
}));
```

## API documentation export

v0.1.0 uses `app.routeRegistry` from `@ogerjs/core` — see [OPENAPI.md](./OPENAPI.md) and `apps/example-banking/src/openapi.ts`.

## Runtime compatibility

`@ogerjs/compat` — runtime mode and Bun-only feature warnings; Node shims for crypto, sqlite, gzip, files:

```ts
import { compat } from "@ogerjs/compat";

app.use(compat({ mode: "edge", features: ["Bun.CryptoHasher"] }));
```

Cross-runtime details: [COMPATIBILITY.md](./COMPATIBILITY.md)

## Scaffolding

`create-oger` CLI:

```bash
bunx create-oger my-api --yes
bunx create-oger --doctor
bunx create-oger --template auth
bunx create-oger --feature users
bunx create-oger --plugin my-plugin
```

Templates: `api`, `auth`, `microservice`.

## Related shipped plugins

| Need | Package |
|------|---------|
| Structured logs + redaction | `@ogerjs/logger` |
| Request tracing | `@ogerjs/request-id` |
| Audit trail | `@ogerjs/audit-log` |
| Response compression | `@ogerjs/compress` |
| ETag / 304 | `@ogerjs/etag` |
| Streaming large payloads | `@ogerjs/stream` |

## Roadmap (not in v0.1.0)

| Capability | Planned package |
|------------|-----------------|
| HTTP response cache | `@ogerjs/cache` |
| Metrics endpoint | `@ogerjs/metrics` |
| OpenTelemetry | `@ogerjs/otel` |
| Production readiness audit | `@ogerjs/readiness` |
| OpenAPI + doc UIs | `@ogerjs/openapi` |
| Background jobs / scheduler | `@ogerjs/jobs` |
| Request profiler / inspector | `@ogerjs/profiler`, `@ogerjs/inspector` |

Status matrix: [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md)
