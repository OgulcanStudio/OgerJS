# Deployment

OgerJS apps deploy as standard Bun/Node applications. The framework is runtime-agnostic with optional Bun-only features gated behind `@ogerjs/compat`.

## Requirements

- **Runtime:** Bun ≥ 1.2 (recommended) or Node 18+ (limited API surface)
- **Package manager:** `bun install` (uses workspace protocol)
- **Build:** `bun run scripts/build.ts` — topological build using `Bun.build` + `tsc --emitDeclarationOnly`

## Build

```bash
bun install
bun run scripts/build.ts       # Build all packages
bun run --cwd packages/mypkg build  # Single package

# Output: packages/*/dist/index.js + dist/index.d.ts
```

The build script:
1. Discovers packages via `packages/*/package.json`
2. Sorts by dependency graph (topological)
3. Runs `Bun.build` (ESM, bun target, externalized workspace deps)
4. Generates declaration files with `tsc --emitDeclarationOnly`

## TypeScript Config

Base config (`tsconfig.base.json`):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "lib": ["ESNext"],
    "types": ["bun"]
  }
}
```

## CI Pipeline

`.github/workflows/ci.yml` runs on push/PR to main:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install
      - run: bun test
      - run: bun run typecheck

  benchmark-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run --cwd benchmark smoke
```

## Environment

```ts
import { loadEnv, t } from "@ogerjs/core";

const env = loadEnv(
  t.Object({
    PORT: t.Optional(t.Integer()),
    JWT_SECRET: t.String({ minLength: 16 }),
    DATABASE_URL: t.String(),
    NODE_ENV: t.Optional(t.Enum("development", "production", "test")),
  }),
  { prefix: "" }, // default: no prefix
);
```

### Production Checklist

Use `@ogerjs/readiness` to audit:

```ts
app.use(readiness({
  requiredEnv: ["JWT_SECRET", "DATABASE_URL"],
  secretEnv: ["API_KEY"],
  requireTls: true,
  requireCors: true,
  requireRateLimit: true,
  requireLogging: true,
  requireHealth: true,
}));
```

## Linting

```bash
bun run lint       # biome check
bun run format     # biome format --write
```

Config (`biome.json`): tab indentation, recommended rules, auto-organize imports on save.

## Graceful Shutdown

```ts
import { shutdown } from "@ogerjs/shutdown";

app.use(shutdown({
  signals: true,       // Register SIGINT/SIGTERM
  timeoutMs: 10_000,   // Force exit after timeout
}));

// Register custom hooks
const registry = app.store.shutdown as ShutdownRegistry;
registry.register("db", async () => db.close());
```

## Runtime Compatibility

```ts
import { compat, setRuntimeMode, isBunRuntime, isEdgeMode } from "@ogerjs/compat";

app.use(compat({ mode: "default" }));
// "default" | "edge" | "bun-enhanced"

if (isBunRuntime()) {
  // Use Bun.file, Bun.CryptoHasher, etc.
}
```

## Scaffolding

```bash
bun create oger my-api                    # Default API template
bun create oger --template auth my-auth   # Auth with JWT + bearer + audit
bun create oger --template microservice   # Microservice with health + shutdown + metrics
bun create oger --doctor                  # Check project for common issues

# Scaffold feature module in existing project
bun create oger --feature users

# Scaffold new plugin package
bun create oger --plugin my-plugin
```

The doctor checks: `package.json` existence, `@ogerjs/core` dependency, version skew across `@ogerjs/*` packages, missing JWT_SECRET in production, missing TypeScript types.

## Node.js with Bun shims

For apps that import `bun:sqlite`, `bun:test`, or use the global `Bun` namespace on Node.js, register the compat loader before your entry point:

```bash
node --import ogerjs/compat/register app.js
```

Or import `@ogerjs/compat/register` as the first line of your entry file. See [COMPATIBILITY.md](./COMPATIBILITY.md).

## Roadmap packages (not in v0.2.0)

`@ogerjs/http-client`, `@ogerjs/circuit-breaker`, and `@ogerjs/data` are planned — see [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md). Use native `fetch` with retries in app code, or `@ogerjs/compat` `Database` for SQLite until those packages ship.
