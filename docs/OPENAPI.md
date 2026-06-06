# OpenAPI and API documentation

**v0.1.0:** Export OpenAPI-style JSON from the compile-time **route registry** in `@ogerjs/core`. Interactive Swagger / Scalar / Redoc UI ships in a future `@ogerjs/openapi` package — see [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md).

## Route registry

After routes are registered, `app.routeRegistry` exposes metadata for every compiled route:

```ts
const registry = app.routeRegistry;
// entries: method, path, schema, meta, errors, macroFlags
```

Use `meta` on routes to enrich exported docs:

```ts
app.get("/users/:id", getUser, {
  meta: {
    tags: ["users"],
    summary: "Get user by ID",
    description: "Returns a single user record.",
    security: [{ bearerAuth: [] }],
  },
});
```

## Minimal OpenAPI export (v0.1.0 pattern)

`apps/example-banking` implements a small `registryToOpenApi()` helper and serves `GET /openapi.json`:

```ts
import { Oger } from "@ogerjs/core";
import { registryToOpenApi } from "./openapi";

const app = new Oger()
  .get("/users", listUsers, { meta: { tags: ["users"], summary: "List users" } })
  .get("/openapi.json", () =>
    registryToOpenApi(app.routeRegistry, {
      title: "Banking API",
      version: "0.1.0",
    }),
  );
```

The helper maps registry entries to OpenAPI 3.0 paths (method, summary, tags, request body / response stubs). Extend it for your schemas or replace with a dedicated generator as needs grow.

Run the reference app:

```bash
bun run --cwd apps/example-banking start
curl http://localhost:3002/openapi.json
```

Full walkthrough: [BANKING.md](./BANKING.md)

## Route metadata fields

| Field | Type | Description |
|-------|------|-------------|
| `tags` | `string[]` | OpenAPI tag grouping |
| `summary` | `string` | Short operation title |
| `description` | `string` | Longer operation text |
| `deprecated` | `boolean` | Mark route deprecated |
| `security` | `object[]` | Security requirement objects |
| `permissions` | `string[]` | Permission names (for manifests / codegen) |

## Planned: `@ogerjs/openapi` plugin

On the roadmap — scoped plugin that will:

| Feature | Planned behavior |
|---------|------------------|
| Spec endpoint | `GET /openapi/json` — OpenAPI 3.1 document |
| Swagger UI | `GET /openapi` |
| Scalar / Redoc | Configurable doc UI paths |
| Security schemes | Auto-detect from JWT / API-key macros |

Until then, use the registry export pattern above or generate clients from `app.routeRegistry` in your own tooling.

## TypeScript client generation

`RouteRegistry` entries include `method`, `path`, `schema`, and `meta` — sufficient to scaffold:

- Typed HTTP clients
- Contract test stubs (`@ogerjs/testing` `generateContractTests()`)
- Permission matrices for admin UIs

```ts
for (const route of app.routeRegistry.entries) {
  console.log(route.method, route.path, route.meta?.summary);
}
```

## Production notes

- Do not expose draft OpenAPI endpoints without authentication in production unless intended
- Disable or protect doc routes in production (`NODE_ENV`, reverse-proxy rules, or `beforeHandle` guard)
- Keep `version` in sync with your API release (e.g. `0.1.0`)

See also: [PLUGINS.md](./PLUGINS.md), [ROUTING.md](./ROUTING.md), [BANKING.md](./BANKING.md)
