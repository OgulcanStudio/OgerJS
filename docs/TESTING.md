# Testing

OgerJS provides built-in in-process testing via `app.inject()` and `app.handleRequest()` — no network socket required. The `@ogerjs/testing` package adds mock containers, contract suites, and benchmark helpers.

## Basic Testing

```ts
import { Oger, t } from "@ogerjs/core";
import { describe, it, expect } from "bun:test";

const app = new Oger()
  .get("/users/:id", ({ params }) => ({ id: params.id }))
  .post("/users", ({ body }) => body, {
    body: t.Object({ name: t.String() }),
  });

describe("User API", () => {
  it("GET /users/:id returns user", async () => {
    const res = await app.inject("/users/42");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "42" });
  });

  it("POST /users validates body", async () => {
    const res = await app.inject({
      method: "POST", path: "/users",
      body: JSON.stringify({ name: "Test" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Test" });
  });

  it("POST /users rejects invalid body", async () => {
    const res = await app.inject({
      method: "POST", path: "/users",
      body: JSON.stringify({ age: 123 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(422);
  });
});
```

## Mock Services & DI

```ts
import { createMockContainer, TOKENS } from "@ogerjs/testing";

const container = createMockContainer({
  db: { findAll: () => Promise.resolve([{ id: "1" }]) },
});

const app = new Oger()
  .decorate({ container })
  .get("/users", async ({ store }) => store.container.resolve(TOKENS.db).findAll());
```

## Plugin Contract Testing

Automated smoke tests for every `@ogerjs/*` plugin:

```ts
import { describe } from "bun:test";
import { runPluginBehaviorTests, discoverPlugins } from "@ogerjs/testing";
import { rateLimit } from "@ogerjs/rate-limit";

describe("@ogerjs/rate-limit", () => {
  const plugin = discoverPlugins().find(p => p.packageName === "@ogerjs/rate-limit")!;

  runPluginBehaviorTests({
    name: "@ogerjs/rate-limit",
    factory: rateLimit,
    smokePath: "/",
    testInvoke: plugin?.testInvoke,
    cases: [
      {
        name: "allows under limit",
        request: { path: "/" },
        expect: { status: 200 },
      },
    ],
  });
});
```

Discover all plugins and run contract suite:

```ts
import { definePluginContractSuite, discoverPlugins } from "@ogerjs/testing";

const plugins = discoverPlugins();
definePluginContractSuite(plugins);
// Tests: package layout + factory export + mounts as Oger
```

## Inject Options

```ts
await app.inject("/path");
await app.inject({ method: "POST", path: "/users", headers: {}, body: "{}" });
await app.inject("/users/42", { headers: { authorization: "Bearer token" } });
```

## Route Benchmarking

```ts
import { benchRoute } from "@ogerjs/testing";

const app = new Oger().get("/", () => ({ ok: true }));
const result = await benchRoute(app, "/", { iterations: 1000 });
// { path, method, iterations, totalMs, avgMs, minMs, maxMs }
```

## Snapshot Helpers

```ts
import { snapshotJson, snapshotOpenApi } from "@ogerjs/testing";

expect(snapshotJson({ key: "value" })).toMatchSnapshot();
expect(snapshotOpenApi(app)).toMatchSnapshot();
```

## Testing Plugins

```ts
import { rateLimit } from "@ogerjs/rate-limit";

const app = new Oger().use(rateLimit({ max: 2, windowMs: 60_000 }));

it("rate limits after 2 requests", async () => {
  await app.inject("/");
  await app.inject("/");
  const res = await app.inject("/");
  expect(res.status).toBe(429);
});
```

## Running Tests

```bash
bun test                    # All tests
bun test --watch            # Watch mode
bun test path/to/test.ts    # Single file
bun test --coverage         # Coverage
```

## Best Practices

1. Use `app.inject()` for unit/integration tests — no socket overhead
2. Override DI with `createMockContainer()` for isolated tests
3. Test validation — both valid and invalid inputs
4. Test error paths — 404, 422, 500
5. Use `runPluginBehaviorTests` for consistent plugin smoke tests
6. Keep tests fast — in-process tests run in microseconds
