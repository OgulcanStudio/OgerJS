# CORE — Oger Class, Context, Lifecycle, Utilities

The `@ogerjs/core` package provides the framework runtime: `Oger` fluent builder, `Context` object, lifecycle hooks, DI, modules, validation, and utilities.

**Source files:** `packages/core/src/oger.ts`, `context.ts`, `types.ts`, `security.ts`, `json.ts`, `env.ts`, `serialize.ts`, `compat.ts`, `request-url.ts`, `inject.ts`, `di.ts`, `module.ts`, `macro.ts`, `plugin.ts`, `contract.ts`

## Oger Class

The main application builder. All methods return `this` for chaining.

### Constructor

```ts
const app = new Oger(config?: OgerConfig);

interface OgerConfig {
  prefix?: string;
  name?: string;
  seed?: string | number;
  scope?: HookScope;       // "local" | "scoped" | "global"
  bodyLimit?: number;       // default 1,048,576 (1 MB)
  contractMode?: ApiContractMode; // "handler-first" | "contract-first"
}
```

### Route Registration

`.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.options()`, `.head()`, `.all(path, handler, opts?)` — see [ROUTING.md](./ROUTING.md).

### .use(plugin) — Plugin Mounting

Accepts an `Oger` instance or a factory function `(parent) => Oger`:

```ts
app.use(cors());
app.use((parent) => jwt({ secret: "key" })(parent));
```

Deduplication: plugins with the same `name + seed` are applied only once, tracked via `WeakMap<Oger, Set<string>>`.

Merging behavior (`plugin.ts`):
- **Store**: `Object.assign` — child overrides parent keys
- **Hooks**: scoped hooks merged; global hooks skipped in local scope
- **Decorators**: `Object.assign` on child entries
- **Derive functions**: appended to parent list
- **Macros**: `Object.assign` on macro definitions
- **Routes**: appended via `mergeRoutes()`

### .state(value) — Shared State

```ts
app.state({ db: createDb(), config: { port: 3000 } });
```

Merged via `Object.assign` onto `ctx.store`.

### .decorate(value) — Context Decorators

```ts
app.decorate({ db: createDb(), logger });
```

Each key gets `Object.assign`ed onto every `Context` object before the route handler runs.

### .derive(fn) — Derived Context

```ts
app.derive(async (ctx) => {
  return { user: await loadUser(ctx.headers.authorization) };
});
```

Executed for every request before `onRequest` hooks. Return object is `Object.assign`ed onto context.

### .macro(definitions) — Route Macros

```ts
app.macro({
  jwt: {
    headers: t.Object({ authorization: t.String() }),
    resolve: async (ctx) => {
      const payload = verifyJwt(ctx.headers.authorization);
      return payload ? { jwt: payload } : Response.json({}, { status: 401 });
    },
  },
});
```

See [ROUTING.md](./ROUTING.md) for macro usage on routes.

### .guard(opts, builder) — Scoped Guards

```ts
app.guard(
  { schema: { headers: t.Object({ "x-api-key": t.String() }) } },
  (api) => { api.get("/admin", handler); },
);
```

### .on(hook, handler, scope?) — Lifecycle Hooks

```ts
app.on("beforeHandle", async (ctx) => { /* ... */ }, "global");
```

Convenience methods:
- `.onRequest(h)` — `global`
- `.parse(h)` — `local`
- `.transform(h)` — `local`
- `.beforeHandle(h)` — `local`
- `.afterHandle(h)` — `local`
- `.mapResponse(h)` — `local`
- `.onError(h)` — `global`
- `.onAfterResponse(h)` / `.onResponse(h)` — `global`
- `.onStart(h)` — `global`
- `.onStop(h)` — `global`

### .compile() — Explicit Compilation

```ts
app.compile(); // returns this
```

Calls `compileRoutes()` and `buildRouteRegistry()`. Automatically invoked on first `.handle()`, `.inject()`, or `.listen()`.

### .listen(portOrOptions) — Start Server

```ts
const server = app.listen(3000);
const server = app.listen({ port: 3000, hostname: "127.0.0.1", development: true });

interface ListenOptions {
  port?: number;           // default 3000
  hostname?: string;       // default "0.0.0.0"
  fetch?: Function;        // fallback fetch for unmatched routes
  tls?: unknown;           // TLS options (Bun.serve shape)
  bodyLimit?: number;
  gracefulShutdown?: boolean; // default true
  development?: boolean;
}
```

Returns `Bun.Server`. Auto-registers SIGINT/SIGTERM for graceful shutdown.

### .stop(closeActiveConnections?) — Stop Server

```ts
app.stop();        // graceful
app.stop(true);    // force-close active connections
```

### .reload() — Hot Swap Routes

```ts
app.reload(); // recompile + Bun.server.reload({ routes })
```

### .handle(request) — Direct Request Handling

```ts
const response = await app.handle(new Request("http://localhost/users/42"));
```

Used internally by `inject()`. Compiles on first call if not yet compiled.

### .inject() — In-Process Testing

```ts
const res = await app.inject("/users/42");
const res = await app.inject({
  method: "POST",
  path: "/users",
  body: { name: "test" },
  headers: { authorization: "Bearer xxx" },
  query: { ref: "abc" },
});

interface InjectOptions {
  method?: string;
  path?: string;
  url?: string;            // overrides path
  headers?: Record<string, string>;
  body?: unknown;          // auto JSON.stringify's, sets content-type
  query?: Record<string, string>;
}
```

### .handleRequest() — Alias

```ts
const res = await app.handleRequest("/users/42");
```

### Getters

```ts
app.routes        // RouteDefinition[] — registered routes
app.store         // Record<string, unknown> — shared state
app.macros        // MacroMap — registered macros
app.server        // Server | null — active server
app.contractMode  // ApiContractMode
app.routeRegistry // RouteRegistry — compiled metadata
```

## Context Object

Created per-request at `context.ts:22`:

```ts
interface Context {
  request: Request;                        // Bun HTTP Request
  params: Record<string, string>;          // :param and * values
  query: Record<string, string>;           // parsed URL query (lazy)
  headers: Record<string, string>;         // lowercase headers (lazy)
  cookie: Record<string, { value: string }>;
  body: unknown;                           // parsed body (lazy)
  set: SetHeaders;                         // response mutators
  store: Record<string, unknown>;          // shared state
  route: string;                           // matched route path
  server: Server | null;                   // active Bun server
  pendingResult?: unknown;                 // set during mapResponse

  // Dynamic decorators/derived values added via .decorate() / .derive()
  [key: string]: unknown;
}
```

### set — Response Mutators

```ts
interface SetHeaders {
  status?: number;                          // override response status
  headers?: Record<string, string>;         // append headers
  redirect?: string;                        // redirect (status 302)
  cookie?: Record<string, {
    value: string;
    httpOnly?: boolean;   // default true
    secure?: boolean;     // default NODE_ENV === "production"
    maxAge?: number;
    path?: string;        // default "/"
    sameSite?: "strict" | "lax" | "none";  // default "lax"
  }>;
}
```

Applied in `applySetHeaders()` at `context.ts:119`.

Example:

```ts
app.get("/login", (ctx) => {
  ctx.set.cookie = { session: { value: token, httpOnly: true, maxAge: 3600 } };
  ctx.set.status = 302;
  ctx.set.headers = { "X-Debug": "1" };
  return { ok: true };
});
```

## Lifecycle Hooks — Execution Order

For a request through the full pipeline (`pipeline.ts:165`):

```
1. onRequest (global)     → early access to raw request
2. parse (global)          → override body parsing
3. parse (local/route)     → per-route body parsing
4. [body parse]            → auto JSON/form/multipart if schema.body defined
5. transform (global)      → data transformation
6. transform (local)       → per-route transformation
7. [validation]            → body, query, params, headers, cookie
8. beforeHandle (global)   → auth, rate limiting (return Response to short-circuit)
9. beforeHandle (local)    → per-route auth/middleware
10. [handler]               → route handler
11. afterHandle (global)    → post-processing (return to override result)
12. afterHandle (local)     → per-route post-processing
13. mapResponse (global)    → transform response value
14. mapResponse (local)     → per-route response transform
15. applySetHeaders         → status, headers, cookies, redirect
-------------------------------------------------------
On error at any step:
   onError (global + local) → custom error responses
   (fallback) errorToResponse(err)
-------------------------------------------------------
Finally (always runs):
   onAfterResponse (global + local) → cleanup, logging (errors caught + logged)
```

### HookHandler Signature

```ts
type HookHandler = (ctx: Context) => unknown | Promise<unknown>;
```

- Return `Response` from `beforeHandle` to short-circuit the pipeline
- Return non-undefined from `afterHandle` / `mapResponse` to override the result
- Return `undefined` to let the pipeline continue

## Security Helpers

`packages/core/src/security.ts`:

```ts
clientIp(request, headers?, options?): string
  // Without trustProxy: returns "local"
  // With trustProxy: parses x-forwarded-for first hop

timingSafeEqual(a: string, b: string): boolean
  // Constant-time compare via node:crypto.timingSafeEqual

escapeHeaderValue(value: string): string
  // Escapes \ and " for double-quoted header values

escapeHtmlAttr(value: string): string
  // Escapes & " < > for HTML attribute contexts

isPathInsideRoot(root: string, target: string): boolean
  // Prevents path traversal

normalizeRelativePath(filePath: string): string | null
  // Normalizes relative paths, returns null on traversal or null bytes
```

## JSON Utilities

`packages/core/src/json.ts`:

```ts
isJsonContentType(contentType: string): boolean
parseJson(text: string): unknown             // JSON.parse
stringifyJson(value: unknown): string        // JSON.stringify
readLimitedText(request, limit): Promise<string>
readJsonBody(request, limit): Promise<unknown>
  // Uses Request.json() for >8KB payloads, text()+parse for smaller
```

## Environment Config

`packages/core/src/env.ts`:

```ts
loadEnv<S extends TSchema>(schema, options?): Static<S>
  // Validates env against t.Object schema, auto-coerces boolean/number/array
  // Options: fromProcessEnv, prefix, secretKeys, defaults

maskEnvValue(value: string, visible?: number): string
  // "abcdef123456" → "********3456"

formatEnvForLog(env, secretKeys?): Record<string, unknown>
  // Redacts matching keys (SECRET, TOKEN, PASSWORD, KEY)
```

## Serialization

`packages/core/src/serialize.ts`:

```ts
fastStringify(value: unknown): string
  // JSON.stringify — no transforms

safeStringify(value: unknown, options?: SerializeOptions): string
  // Supports BigInt → string, Date → ISO, redaction, custom serializers

safeParse(text: string): unknown
  // JSON.parse, returns undefined on empty input

interface SerializeOptions {
  nullifyUndefined?: boolean;
  serializers?: Record<string, (value: unknown) => unknown>;
  redact?: boolean;
  sensitiveKeys?: string[];
}
```

## Runtime Compatibility

`packages/core/src/compat.ts` tracks runtime-specific environment modes:

```ts
type RuntimeMode = "default" | "edge" | "bun-enhanced";

setRuntimeMode(mode: RuntimeMode): void
getRuntimeMode(): RuntimeMode

isBunRuntime(): boolean
isEdgeMode(): boolean
isBunEnhancedMode(): boolean

isBunOnlyFeature(feature: string): boolean
warnIfBunOnly(feature: string, detail?: string): void
  // Warns once when using Bun-only features in edge mode

allowsBunOnlyFeature(feature: string): boolean
```

Bun-only features tracked: `bun.serve`, `bun.password`, `bun.gzip`, `bun.sqlite`, `bun.redis`, `bun.cryptohasher`, `hot-reload`, `native-compress`.

To bridge these differences, OgerJS provides **native cross-runtime delegation wrappers** in the opt-in package `@ogerjs/compat`. It allows you to run SQLite, password hashing, compression, and hasher routines seamlessly on both Bun and Node.js without package bloat or compilation issues. See [docs/COMPATIBILITY.md](./COMPATIBILITY.md) for more details.

## DI Container

`packages/core/src/di.ts`:

```ts
const container = createContainer();

container.register("db", dbClient);
container.registerFactory("config", (c) => loadConfig(), { scope: "singleton" });

container.resolve("db");    // returns dbClient
container.has("db");        // true
container.override("db", mockDb);  // for tests

const requestScope = container.createRequestScope(); // inherits singletons

interface Container {
  register<T>(token: Token<T>, value: T, options?: RegisterOptions): void;
  registerFactory<T>(token: Token<T>, factory, options?): void;
  resolve<T>(token: Token<T>): T;
  has(token: Token): boolean;
  override<T>(token: Token<T>, value: T): void;
  createRequestScope(): Container;
}

type ProviderScope = "singleton" | "transient" | "request";
```

## Modules & Controllers

`packages/core/src/module.ts`:

```ts
const userModule = defineModule({
  name: "users",
  providers: [{ token: "repo", useValue: userRepo }],
  setup: ({ app, container }) => {
    app.get("/users", listUsers);
    app.post("/users", createUser);
  },
});

app.use(userModule);
```

Controllers provide a simpler route table pattern:

```ts
const userCtrl = defineController({
  prefix: "/users",
  routes: [
    { method: "get", path: "/", handler: listUsers },
    { method: "post", path: "/", handler: createUser },
  ],
});
```

## Contracts (Phase 2 scaffold)

`packages/core/src/contract.ts`:

```ts
type ApiContractMode = "handler-first" | "contract-first";

const contract = defineContract({ ... });
assertContractHandlers(routes, contracts); // build-time validation (Phase 2)
```

## Cross-References

- [OVERVIEW.md](./OVERVIEW.md) — Architecture, quickstart, package table
- [ROUTING.md](./ROUTING.md) — Route registration, groups, guards, compilation
- [VALIDATION.md](./VALIDATION.md) — Schema builder, compileSchema, inference
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) — Error classes, errorToResponse
- [PLUGINS.md](./PLUGINS.md) — Plugin authoring (definePlugin)
- [DI_MODULES.md](./DI_MODULES.md) — DI container, modules, controllers
