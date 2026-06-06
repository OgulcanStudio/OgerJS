# Getting Started

OgerJS is a Bun-native HTTP framework with fluent macro ergonomics, zero-dependency core, native `Bun.serve({ routes })` routing, composable plugins, and built-in `t` validation.

## Requirements

- **Bun** >= 1.2.3 (recommended runtime)
- **Node.js** 18+ optional (HTTP fallback + `ogerjs/compat`)

## Install

Everything ships in one npm package [`ogerjs`](https://www.npmjs.com/package/ogerjs) on the [Ogulcan Studio](https://www.npmjs.com/~ogulcanstudio) account. Plugins use subpath imports (`ogerjs/cors`, `ogerjs/jwt`, …). The monorepo uses `@ogerjs/*` workspace names locally.

New project (recommended):

```bash
bunx ogerjs my-api --yes
cd my-api
bun install
bun run start
```

Existing project:

```bash
bun add ogerjs
```

## Hello world

```ts
import { Oger, t } from "ogerjs";

const app = new Oger()
  .get("/", () => ({ status: "ok" }))
  .get("/health", () => "healthy")
  .post(
    "/users",
    ({ body }) => ({ id: "usr_1", ...body }),
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1 }),
      }),
    },
  )
  .listen(3000);

console.log(`Listening on http://localhost:${app.server?.port}`);
```

## Core concepts

### Routes

Register handlers with `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.options()`, `.head()`, or `.all()`. Path params use `:name`; wildcards use `*`.

```ts
app
  .get("/users/:id", ({ params }) => getUser(params.id))
  .group("/api/v1", (api) => {
    api.get("/accounts/:id/balance", ({ params }) => getBalance(params.id));
  });
```

See [ROUTING.md](./ROUTING.md).

### Validation (`t`)

Schemas compile to validators at route registration. TypeScript types flow via `Static<T>`.

```ts
import { t, type Static } from "ogerjs";

const UserBody = t.Object({ name: t.String() });
type UserBody = Static<typeof UserBody>;

app.post("/users", ({ body }) => createUser(body), { body: UserBody });
```

Failed validation returns **422** with RFC 7807 `application/problem+json`. See [VALIDATION.md](./VALIDATION.md).

### Plugins

Mount security, observability, and enterprise plugins with `.use()`:

```ts
import { cors } from "ogerjs/cors";
import { helmet } from "ogerjs/helmet";
import { logger } from "ogerjs/logger";
import { requestId } from "ogerjs/request-id";

app
  .use(requestId())
  .use(logger())
  .use(helmet())
  .use(cors({ origin: ["https://app.example.com"], credentials: true }));
```

See [PLUGINS.md](./PLUGINS.md) and [SECURITY.md](./SECURITY.md).

### Lifecycle hooks

Per-route or global: `onRequest`, `parse`, `transform`, `beforeHandle`, `afterHandle`, `mapResponse`, `onError`, `onAfterResponse`, `onStart`, `onStop`.

```ts
app
  .onStart(() => console.log("server ready"))
  .beforeHandle(({ request }) => {
    if (!request.headers.get("authorization")) {
      return new Response("Unauthorized", { status: 401 });
    }
  });
```

See [CORE.md](./CORE.md).

### In-process testing

No socket required:

```ts
const res = await app.inject("/users", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Ada" }),
});
expect(res.status).toBe(200);
```

See [TESTING.md](./TESTING.md).

## Monorepo layout (this repository)

```
packages/core/     Framework core (@ogerjs/core)
packages/*         Opt-in plugins (security, observability, enterprise)
apps/*             Reference applications
benchmark/         HTTP comparison harness
docs/              Documentation (this folder)
```

## Common packages (v0.1.0)

| Package | Purpose |
|---------|---------|
| `@ogerjs/core` | Framework, `t` validation, `inject()`, route registry |
| `@ogerjs/jwt` | JWT sign/verify |
| `@ogerjs/cors` | CORS |
| `@ogerjs/helmet` | Security headers |
| `@ogerjs/logger` | Request logging with redaction |
| `@ogerjs/rate-limit` | Rate limiting |
| `@ogerjs/idempotency` | Idempotent POST |
| `@ogerjs/compat` | Bun/Node compatibility helpers |

OpenAPI UI plugin is roadmap — v0.1.0 exports specs via `app.routeRegistry` ([OPENAPI.md](./OPENAPI.md)).

Full list: [OVERVIEW.md](./OVERVIEW.md#package-table).

## Development commands

```bash
bun install          # Install workspace deps
bun test packages    # Run package tests
bun run typecheck    # TypeScript check
bun run build        # Build all packages
bun run benchmark    # HTTP benchmark (see BENCHMARKS.md)
```

## Next steps

1. [ROUTING.md](./ROUTING.md) — groups, guards, macros
2. [AUTH.md](./AUTH.md) — authentication patterns
3. [DEPLOYMENT.md](./DEPLOYMENT.md) — production checklist
4. [BENCHMARKS.md](./BENCHMARKS.md) — performance methodology
5. [BANKING.md](./BANKING.md) — full enterprise reference app
