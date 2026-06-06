# Routing

OgerJS routing compiles route definitions into Bun's native `Bun.serve({ routes })` format for maximum performance. The compilation pipeline produces a `RouteIndex` (exact `Map` + dynamic array) and an optional Bun-native route map.

**Source files:** `packages/core/src/compiler/routes.ts`, `pipeline.ts`, `registry.ts`

## HTTP Method Handlers

All methods return `this` for fluent chaining:

```ts
import { Oger } from "@ogerjs/core";

const app = new Oger();

app.get("/", handler);       // GET
app.post("/", handler);       // POST
app.put("/", handler);        // PUT
app.patch("/", handler);      // PATCH
app.delete("/", handler);     // DELETE
app.options("/", handler);    // OPTIONS
app.head("/", handler);       // HEAD
app.all("/", handler);        // matches any HTTP method

// Signatures:
// .get(path: string, handler: RouteHandler, opts?: RouteOpts): this
// .post(path: string, handler: RouteHandler, opts?: RouteOpts): this
// ... (same for all methods)
// .all(path: string, handler: RouteHandler, opts?: RouteOpts): this
```

Type: `RouteHandler = (ctx: Context) => unknown | Promise<unknown>`

## Path Patterns

| Pattern | Example | Matches |
|---------|---------|---------|
| Exact | `/users` | `/users` |
| Dynamic `:param` | `/users/:id` | `/users/42` (`params.id = "42"`) |
| Catch-all `*` | `/files/*path` | `/files/a/b/c` (`params["*"] = "a/b/c"`) |
| Multiple params | `/orgs/:orgId/repos/:repoId` | `/orgs/1/repos/2` |

```ts
app.get("/users/:id", ({ params }) => params.id);
app.get("/files/*path", ({ params }) => params["*"]);
app.get("/orgs/:orgId/repos/:repoId", ({ params }) => `${params.orgId}/${params.repoId}`);
```

Parameters are always strings sourced from `ctx.params`. Extraction uses `extractParamsFromPath()` at `routes.ts:163`.

## Route Groups

Share prefix, hooks, store, macros, and decorators across routes:

```ts
app.group("/api/v1", (api) => {
  api.group("/users", (users) => {
    users.get("/", listUsers);                // GET /api/v1/users
    users.post("/", createUser, schema);      // POST /api/v1/users
    users.get("/:id", getUser);               // GET /api/v1/users/:id
  });
});
// Chain groups:
app
  .group("/admin", (admin) => {
    admin.get("/stats", getStats);
  })
  .group("/public", (pub) => {
    pub.get("/health", health);
  });
```

Inherited from parent: `_store`, `_hooks`, `_macros`, `_decorators`, `_deriveFns`, `_bodyLimit`.

## Guards

Apply schema and hooks to a group without a prefix:

```ts
app.guard(
  {
    schema: {
      headers: t.Object({ "x-api-key": t.String() }),
      query: t.Object({ token: t.String() }),
    },
    beforeHandle: [validateApiKey, rateLimit],
  },
  (api) => {
    api.get("/admin/users", listUsers);
    api.post("/admin/users", createUser);
  },
);
```

Guards merge schema properties (guard schema applied first, route schema overrides) and prepend `beforeHandle` hooks to each route.

## Route Options (`RouteOpts`)

Full type at `oger.ts:436`:

```ts
interface RouteOpts {
  body?: TSchema;
  query?: TSchema;
  params?: TSchema;
  headers?: TSchema;
  cookie?: TSchema;
  response?: TSchema;
  schema?: RouteSchema;              // alternative grouping
  beforeHandle?: HookHandler;
  meta?: RouteMeta;                  // OpenAPI + policy
  errors?: RouteErrors;              // declared problem responses
  staticResponse?: Response;         // skip handler, return directly
  [key: string]: unknown;            // macro flags (jwt: true, admin: true, ...)
}
```

Example:

```ts
app.post("/users", handler, {
  body: t.Object({ name: t.String() }),
  query: t.Object({ ref: t.Optional(t.String()) }),
  params: t.Object({}),
  headers: t.Object({ authorization: t.String() }),
  cookie: t.Object({ session: t.String() }),
  response: t.Object({ id: t.String() }),
  beforeHandle: async (ctx) => { await authenticate(ctx); },
  meta: {
    tags: ["users"],
    summary: "Create user",
    description: "Creates a new user record",
    deprecated: false,
    security: [{ bearerAuth: [] }],
    permissions: ["users:write"],
    roles: ["admin"],
    auth: true,
    rateLimit: { max: 10, windowMs: 60_000 },
    cache: { maxAge: 0 },
    audit: { action: "user.create" },
  },
  errors: {
    400: { title: "Bad Request", code: "VALIDATION_ERROR" },
    409: { title: "Conflict", code: "DUPLICATE_EMAIL" },
    422: { title: "Validation Failed" },
  },
});
```

## Route Compilation

### compileRoutes()

`routes.ts:88` — converts `RouteDefinition[]` into a `CompiledRoute[]` + Bun native route map + `RouteIndex`:

```ts
function compileRoutes(
  routes: RouteDefinition[],
  options: PipelineOptions,
): {
  compiled: CompiledRoute[]
  bunRoutes: Record<string, unknown>  // Bun.serve({ routes }) shape
  index: RouteIndex
}
```

### RouteIndex

`routes.ts:22` — dual-structure for O(1) exact match + linear dynamic scan:

```ts
interface RouteIndex {
  exact: Map<string, CompiledRoute>   // "GET:/users/42" -> route
  dynamic: CompiledRoute[]            // routes with `:` or `*`
}
```

Type `routeKey(method, path)` → `"GET:/users/42"`.

### Route Matching — matchRoute()

`routes.ts:182` — tries exact map first, then scans dynamic array:

```ts
function matchRoute(
  compiled: CompiledRoute[],
  method: string,
  pathname: string,
  index?: RouteIndex,
): CompiledRoute | undefined
```

Matching order: exact paths > dynamic (`:param` / `*`). `ALL` method matches every HTTP method.

### Route Registry

`registry.ts:40` — metadata-only snapshot for OpenAPI, SDK generators, and test fixtures:

```ts
const registry = app.routeRegistry; // auto-compiles if needed
registry.entries;                    // readonly RegisteredRoute[]
registry.find("GET", "/users/:id"); // registered route metadata
JSON.stringify(registry);           // serializable snapshot
```

## Pipeline Compilation — compilePipeline()

`pipeline.ts:112` — each route gets a compiled `Pipeline` with `run(req, server, params) => Promise<Response>`.

Three pipeline modes based on route complexity:

### 1. Simple Route (optimized)

`isSimpleRoute()` at `pipeline.ts:29` — true when a route has **no** schema, no per-route hooks, no global hooks, no derive functions, and no decorators.

```ts
function isSimpleRoute(route: RouteDefinition, options: PipelineOptions): boolean {
  if (route.schema || route.staticResponse) return false;
  if (hasHooks(route.hooks) || hasHooks(options.globalHooks)) return false;
  if (options.deriveFns.length > 0) return false;
  if (Object.keys(options.decorators).length > 0) return false;
  return true;
}
```

Generates a minimal context (empty params/query/headers/cookie — avoids allocations). No body parsing, no validation, no hook iteration.

### 2. Static Literal Optimization

For `GET` routes that are simple and return a string literal, the compiler extracts the literal body at compile time via `tryCompileLiteralString()` and registers it as a `Response` directly in `bunRoutes` — zero runtime cost.

### 3. Minimal Pipeline (static, simple)

Uses `compileSimpleServeHandler()` at `pipeline.ts:79` — creates a minimal context with empty params/query/headers/cookie. Runs handler → `toResponse()`.

### 4. Full Pipeline

For routes with schemas, hooks, decorators, or derive functions. Executes full lifecycle:

```
onRequest (global) → parse (global+local) → body parse → transform (global+local)
→ validation (body/query/params/headers/cookie) → beforeHandle (global+local)
→ handler → afterHandle (global+local) → mapResponse (global+local) → applySetHeaders
```

On error: `onError (global+local)` → `errorToResponse()` as fallback.

Finally block: `onAfterResponse (global+local)`.

## Hot Reload

```ts
const app = new Oger().get("/", handler).listen(3000);
// after code changes:
app.reload(); // recompiles, calls server.reload({ routes })
```

## Testing Routes

See [CORE.md](./CORE.md) for `inject()` and `handleRequest()`.

```ts
const res = await app.inject("/users/42");
const res2 = await app.inject({ method: "POST", path: "/users", body: { name: "test" } });
```

## Cross-References

- [OVERVIEW.md](./OVERVIEW.md) — Quickstart, architecture, package table
- [VALIDATION.md](./VALIDATION.md) — Schema builder and compileSchema
- [CORE.md](./CORE.md) — Oger class, lifecycle hooks, context
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) — Error responses pipeline
