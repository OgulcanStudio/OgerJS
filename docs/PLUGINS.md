# Plugins

Plugins compose functionality into OgerJS via `.use()`. They add routes, hooks, store values, decorators, macros, and derive functions. Plugins are the primary extension mechanism for the framework.

## Using Plugins

```ts
import { Oger } from "@ogerjs/core";
import { cors } from "@ogerjs/cors";
import { helmet } from "@ogerjs/helmet";
import { rateLimit } from "@ogerjs/rate-limit";

const app = new Oger()
  .use(helmet())
  .use(cors({ origin: ["https://app.example.com"], credentials: true }))
  .use(rateLimit({ max: 100, windowMs: 60_000 }));
```

## Plugin Categories

| Category | Packages |
|----------|----------|
| **Security** | `helmet`, `cors`, `rate-limit`, `csrf`, `ip-filter`, `body-limit`, `bot-guard`, `jwt`, `cookie`, `basic-auth`, `api-key` |
| **Observability** | `request-id`, `logger`, `metrics`, `otel`, `server-timing`, `audit-log` |
| **Content** | `json`, `html`, `htmx`, `compress`, `etag`, `negotiate` |
| **Real-time** | `sse`, `ws`, `presence` |
| **File/Stream** | `static`, `upload`, `stream` |
| **Infrastructure** | `health`, `shutdown`, `cache`, `jobs`, `idempotency`, `circuit-breaker` |
| **Enterprise** | `quota`, `billing`, `flags`, `ab-test`, `webhook`, `replay` |
| **DX/Dev** | `openapi`, `docgen`, `manifest`, `chaos`, `profiler`, `inspector`, `hot-reload`, `compat` |
| **Testing** | `testing` (plugin-registry, plugin-contract) |

## Creating Plugins

### definePlugin

Creates a plugin with no options:

```ts
import { definePlugin } from "@ogerjs/core";

const myPlugin = definePlugin(
  { name: "@my/plugin" },
  (app) => app
    .onRequest((ctx) => { ctx.set.headers["x-custom"] = "value"; })
    .get("/health", () => ({ ok: true })),
);
// Usage: app.use(myPlugin())
```

### definePluginWithOptions

Creates a plugin that requires options:

```ts
import { definePluginWithOptions } from "@ogerjs/core";

interface MyPluginOptions {
  prefix: string;
  enabled: boolean;
}

const myPlugin = definePluginWithOptions<MyPluginOptions>(
  { name: "@my/plugin" },
  (app, options) => {
    if (!options.enabled) return app;
    return app.get(options.prefix + "/health", () => ({ ok: true }));
  },
  (options) => options.prefix, // seed for deduplication
);
// Usage: app.use(myPlugin({ prefix: "/v1", enabled: true }))
```

### definePluginWithOptionalOptions

Creates a plugin with optional options and defaults:

```ts
import { definePluginWithOptionalOptions } from "@ogerjs/core";

const cors = definePluginWithOptionalOptions<CorsOptions>(
  { name: "@ogerjs/cors", scope: "global" },
  (app, options) => { /* setup */ },
  {}, // defaults
  (options) => `${options.origin}`, // seed
);
// Usage: app.use(cors()) or app.use(cors({ origin: "https://a.com" }))
```

### Scoped Plugins

Scoped plugins receive the parent `Oger` instance and return a child app whose hooks apply only to its own routes:

```ts
import { defineScopedPlugin, defineScopedPluginWithOptionalOptions } from "@ogerjs/core";

// Required options
const myPlugin = defineScopedPlugin<{ prefix: string }>(
  { name: "@my/scoped" },
  (parent, options) => {
    const child = new Oger({ name: "@my/scoped", scope: "scoped" });
    child.onRequest((ctx) => { /* runs only for plugin routes */ });
    return child.get(options.prefix + "/route", handler);
  },
);

// With optional options (scoped plugin reads parent routes)
const docs = defineScopedPluginWithOptionalOptions<DocsOptions>(
  { name: "@my/docs" },
  (parent, options) => {
    const spec = buildSpecFromRegistry(parent.routeRegistry, options);
    return new Oger({ name: "@my/docs" })
      .get(options.path ?? "/openapi.json", () => spec);
  },
  {},
);
// Usage: app.use(docs({ title: "My API" })(app))
```

See `apps/example-banking` for a v0.1.0 route-registry export pattern ([OPENAPI.md](./OPENAPI.md)).

## Plugin Lifecycle

Each `.use()` during `compile()`:
1. **Deduplication check** via `shouldApplyPlugin()` — skipped if same `meta.name + meta.seed` already applied
2. **Store merge** — parent keys win on conflict
3. **Hook merge** — scoped plugin hooks apply only to plugin routes; global hooks apply to all
4. **Decorator merge** — later wins
5. **Derive functions** — appended to parent list
6. **Macro merge** — later wins
7. **Route merge** — order preserved for matching priority

## Deduplication

Plugins with the same name + seed are applied once. The `pluginKey()` function generates `"name:seed"`. A `WeakMap<Oger, Set<string>>` tracks applied plugins per parent.

```ts
app.use(rateLimit({ max: 100 }));   // seed: "100:60000:false"
app.use(rateLimit({ max: 100 }));   // skipped — same seed
app.use(rateLimit({ max: 200 }));   // applied — different seed
```

## Plugin Merge Logic

Merge functions in `packages/core/src/plugin.ts`:

| Function | Behavior |
|----------|----------|
| `mergeStore(target, source)` | `Object.assign` — source overwrites target |
| `mergeHooks(target, source, scope, childScope)` | Global hooks always merge; scoped hooks skip when parent scope is local |
| `mergeRoutes(target, source, prefix)` | Appends with optional path prefix |
| `shouldApplyPlugin(parent, child, meta)` | Returns `false` if key already tracked |

## Plugin Manifest Field

Package.json `ogerjs` field declares plugin metadata:

```json
{
  "name": "@ogerjs/cors",
  "ogerjs": {
    "plugin": true,
    "export": "cors",
    "scoped": false,
    "scope": "global",
    "testInvoke": { "origin": ["https://example.com"] }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `plugin` | `boolean` | Required — marks as an OgerJS plugin |
| `export` | `string` | Override default export name (camelCase from dir name) |
| `scoped` | `boolean` | When true, uses parent-scoped factory |
| `scope` | `string` | Hook scope: `"local"`, `"scoped"`, `"global"` |
| `testInvoke` | `unknown` | Default options for contract tests |

## Marketplace Meta

```ts
import { definePluginMarketplaceMeta } from "@ogerjs/presets";

const meta = definePluginMarketplaceMeta({
  name: "@ogerjs/cors",
  permissions: [],
  routes: ["OPTIONS /*"],
  configSchema: { origin: { type: "string" } },
  securityRisk: "low",
});
```

## Plugin Registry

The `@ogerjs/testing` package provides automated plugin discovery and contract testing:

```ts
import { discoverPlugins, definePluginContractSuite, runPluginBehaviorTests } from "@ogerjs/testing";

// Discover all @ogerjs/* plugins in the monorepo
const plugins = discoverPlugins();
// [
//   { dirName: "cors", packageName: "@ogerjs/cors", exportName: "cors", ... },
//   { dirName: "jwt", packageName: "@ogerjs/jwt", exportName: "jwt", ... },
// ]

// Define a contract test suite
definePluginContractSuite(plugins);

// Run behavior tests for a single plugin
runPluginBehaviorTests({
  name: "CORS plugin",
  factory: cors,
  smokePath: "/",
  scoped: false,
  testInvoke: { origin: ["https://example.com"] },
  cases: [{ name: "sets CORS headers", request: { path: "/" }, expect: { status: 204 } }],
});
```

### Registry Constants

| Constant | Purpose |
|----------|---------|
| `PLUGIN_EXPORT_OVERRIDES` | Maps dir names to non-default export names (`flags` → `featureFlags`) |
| `PLUGIN_TEST_INVOKE` | Default test options for plugins requiring non-empty config |
| `PLUGIN_SCOPED` | Set of plugin dir names using scoped factories |
| `NON_PLUGIN_PACKAGES` | Packages excluded from plugin discovery |

## Plugin with Macros

```ts
import { definePluginWithOptions, t } from "@ogerjs/core";

const authPlugin = definePluginWithOptions<{ secret: string }>(
  { name: "@my/auth" },
  (app, { secret }) => app
    .macro({
      requireAuth: {
        headers: t.Object({ authorization: t.String() }),
        async resolve(ctx) {
          const token = ctx.headers.authorization.replace("Bearer ", "");
          const user = await verify(token, secret);
          if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
          return { user };
        },
      },
    })
    .decorate({ verifyToken: (token: string) => verify(token, secret) }),
  ({ secret }) => secret,
);
// Usage: app.get("/me", handler, { requireAuth: true })
```

## Best Practices

1. **Order matters**: Security plugins first (`helmet`, `cors`, `rate-limit`)
2. **Use scoped plugins** for route-specific functionality to avoid hook bleed
3. **Provide seeds** for option-based deduplication
4. **Export types** for macro flags and decorators
5. **Keep plugins focused** — one concern per plugin
6. **Use the `ogerjs` manifest field** to enable automated discovery and testing

See also: [DI_MODULES.md](./DI_MODULES.md), [AUTH.md](./AUTH.md), [SECURITY.md](./SECURITY.md), [OPENAPI.md](./OPENAPI.md)
