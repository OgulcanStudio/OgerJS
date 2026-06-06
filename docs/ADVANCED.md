# Advanced Features

Optional architecture modules, DI, controllers, route metadata, typed configuration, lifecycle hooks, in-process testing, real-time plugins, observability, and background job queue.

## Checklist

| Feature | Status | Package |
|---------|--------|---------|
| Built-in DI | Done | `@ogerjs/core` — `createContainer()` |
| Controller / module system | Done | `defineModule()`, `defineController()` |
| Route metadata (tags, summary, permissions) | Done | `RouteMeta` on routes |
| Typed `.env` validation | Done | `loadEnv(t.Object({...}))` |
| Lifecycle hooks | Done | `onStart`, `onStop`, `onRequest`, `onError`, pipeline hooks |
| Request ID | Done | `@ogerjs/request-id` |
| Structured logs | Done | `@ogerjs/logger` |
| Metrics | Planned | `@ogerjs/metrics` — [roadmap](./ENTERPRISE_ROADMAP.md) |
| OpenTelemetry surface | Planned | `@ogerjs/otel` — [roadmap](./ENTERPRISE_ROADMAP.md) |
| SSE / WebSocket | Done | `@ogerjs/sse`, `@ogerjs/ws` |
| Background jobs | Planned | `@ogerjs/jobs` — use Bun `Worker` directly in v0.1.0 |
| Testing utilities | Done | `@ogerjs/core` — `app.inject()` |

## In-Process Testing

No socket required:

```ts
import { Oger } from "@ogerjs/core";
const app = new Oger().get("/users/:id", ({ params }) => params.id);
const res = await app.inject("/users/42");
const res2 = await app.handleRequest({ method: "GET", path: "/users/42" });
```

## Route Metadata

Attach OpenAPI and policy hints per route:

```ts
app.get("/items", () => [], {
  meta: {
    tags: ["catalog"],
    summary: "List items",
    permissions: ["items:read"],
    auth: true,
    rateLimit: { max: 100, windowMs: 60_000 },
  },
});
```

## DI & Modules

```ts
import { createContainer, defineModule, Oger } from "@ogerjs/core";

const DB = Symbol("db");

const usersModule = defineModule({
  name: "data",
  providers: [{ token: DB, useFactory: () => ({ query: async () => [] }) }],
  setup: ({ app: mod, container }) => {
    mod.get("/rows", async () => container.resolve(DB).query());
  },
});

const app = new Oger().use(usersModule);
```

Controllers on a prefix:

```ts
import { defineController } from "@ogerjs/core";
app.use(
  defineController({
    prefix: "/v1",
    routes: [{ method: "get", path: "/health", handler: () => ({ ok: true }) }],
  }),
);
```

## Typed Environment

```ts
import { loadEnv, t } from "@ogerjs/core";

const env = loadEnv(
  t.Object({
    PORT: t.Integer(),
    DATABASE_URL: t.String(),
    DEBUG: t.Optional(t.Boolean()),
  }),
  { prefix: "APP_" },
);
```

## Lifecycle

| Hook | When |
|------|------|
| `onStart` | After `listen()` |
| `onStop` | During `stop()` |
| `onRequest` | Start of pipeline |
| `onResponse` | `onAfterResponse` alias |
| `onError` | Uncaught handler errors |
| `parse` / `transform` / `beforeHandle` / `afterHandle` / `mapResponse` | Pipeline stages |

## Server-Sent Events

```ts
import { sseHandler } from "@ogerjs/sse";
app.get("/events", sseHandler(async (send) => {
  send("tick", { t: Date.now() });
}));
```

## WebSockets

```ts
import { createWebSocketHandlers, requireWebSocketUpgrade } from "@ogerjs/ws";

const websocket = createWebSocketHandlers({
  handlers: { message(ws, msg) { ws.send(`echo:${msg}`); } },
});

Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      const bad = requireWebSocketUpgrade(req);
      if (bad) return bad;
      return server.upgrade(req, { data: {} });
    }
    return app.handle(req);
  },
  websocket,
});
```

## Metrics, OpenTelemetry, jobs (roadmap)

`@ogerjs/metrics`, `@ogerjs/otel`, and `@ogerjs/jobs` are planned — see [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md). In v0.1.0 use `@ogerjs/logger`, `@ogerjs/request-id`, and `@ogerjs/audit-log` for observability, or wire your own OTLP exporter in `onAfterResponse`.

## Background work with Bun Worker (v0.1.0)

Offload CPU-heavy work to a Bun Worker:

```ts
// worker.ts
self.onmessage = (ev: MessageEvent) => {
  postMessage({ ok: true });
};

// bootstrap.ts
const worker = new Worker(new URL("./worker.ts", import.meta.url));
app.onStop(() => worker.terminate());
worker.postMessage(queue.dequeue()?.payload);
```
