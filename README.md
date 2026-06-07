# OgerJS

**Ultra-fast Bun-native HTTP framework** with fluent macro ergonomics, zero-dependency core, native `Bun.serve({ routes })` routing, composable plugins, and built-in `t` validation.

**Version 0.2.0** · **Bun >= 1.2.3** · Node.js 18+ via HTTP fallback (`ogerjs/compat`) · Published on [npm](https://www.npmjs.com/package/ogerjs) by [Ogulcan Studio](https://ogulcan.studio)

```bash
npm i ogerjs
# or
bun add ogerjs
```

---

## The speed story

OgerJS is built around the number teams feel first: **how many banking-shaped requests your API can serve per second** — with real auth, validation, nested routes, and batch JSON payloads, not just a hello-world ping.

Measured with the Go runner in `benchmark/` (500 requests, 128 concurrency, 50 warmup, 8 runtimes × 12 scenarios):

```bash
bun run build
cd benchmark
go run benchmark.go
```

**OgerJS (Bun) wins 12 / 12 scenarios.** Local run: Windows AMD64, Bun 1.3.14, Go 1.26.3.

| Speed signal | OgerJS (Bun) | vs Hono (Bun) | vs Express |
|--------------|-------------:|--------------:|-----------:|
| Plain ping `GET /` | **39,708 req/s** | **+66%** faster | **7.6×** faster |
| JSON body parse | **32,533 req/s** | **2.2×** faster | **9.6×** faster |
| Transfer validation | **32,958 req/s** | **1.5×** faster | **5.0×** faster |
| Large JSON batch | **25,488 req/s** | **1.8×** faster | **4.9×** faster |
| Auth gate | **21,280 req/s** | **1.3×** faster | **3.2×** faster |
| Middleware chain | **36,495 req/s** | **1.5×** faster | **4.2×** faster |
| **Average throughput** | **~26,540 req/s** | **+46%** vs Hono (Bun) | **3.9×** vs Express |

### Full benchmark output (req/s, p50, p99)

```
── GET / (ping) ──
  Vanilla Bun     32702 req/s |  500 ok | p50  2.73 ms | p99  7.13 ms | err 0
  Vanilla Node    12312 req/s |  500 ok | p50  6.73 ms | p99 34.25 ms | err 0
  OgerJS (Bun)    39708 req/s |  500 ok | p50  2.07 ms | p99  6.40 ms | err 0
  OgerJS (Node)    6908 req/s |  500 ok | p50 13.72 ms | p99 62.11 ms | err 0
  Hono (Bun)      23929 req/s |  500 ok | p50  3.85 ms | p99 11.18 ms | err 0
  Hono (Node)      9393 req/s |  500 ok | p50 10.24 ms | p99 39.48 ms | err 0
  Elysia          28437 req/s |  500 ok | p50  3.76 ms | p99  8.07 ms | err 0
  Express          5237 req/s |  500 ok | p50 12.36 ms | p99 93.33 ms | err 0
  → fastest: OgerJS (Bun) (39708 req/s)

── POST /bench/json-parse ──
  Vanilla Bun     14974 req/s |  500 ok | p50  7.33 ms | p99 15.45 ms | err 0
  Vanilla Node     9719 req/s |  500 ok | p50  9.38 ms | p99 40.92 ms | err 0
  OgerJS (Bun)    32533 req/s |  500 ok | p50  2.19 ms | p99  8.11 ms | err 0
  OgerJS (Node)    4579 req/s |  500 ok | p50 20.29 ms | p99 80.17 ms | err 0
  Hono (Bun)      14779 req/s |  500 ok | p50  6.31 ms | p99 15.23 ms | err 0
  Hono (Node)      2972 req/s |  500 ok | p50 36.63 ms | p99 114.57 ms | err 0
  Elysia          15758 req/s |  500 ok | p50  5.48 ms | p99 15.61 ms | err 0
  Express          3377 req/s |  500 ok | p50 27.62 ms | p99 114.47 ms | err 0
  → fastest: OgerJS (Bun) (32533 req/s)

── GET /bench/json-serialize ──
  Vanilla Bun     17797 req/s |  500 ok | p50  4.06 ms | p99 11.31 ms | err 0
  Vanilla Node    12360 req/s |  500 ok | p50  6.78 ms | p99 29.90 ms | err 0
  OgerJS (Bun)    26164 req/s |  500 ok | p50  2.23 ms | p99 12.15 ms | err 0
  OgerJS (Node)    9050 req/s |  500 ok | p50 11.47 ms | p99 28.94 ms | err 0
  Hono (Bun)      18951 req/s |  500 ok | p50  4.31 ms | p99 13.12 ms | err 0
  Hono (Node)      9080 req/s |  500 ok | p50 12.28 ms | p99 23.01 ms | err 0
  Elysia          20333 req/s |  500 ok | p50  3.17 ms | p99 16.71 ms | err 0
  Express          5875 req/s |  500 ok | p50 17.69 ms | p99 46.58 ms | err 0
  → fastest: OgerJS (Bun) (26164 req/s)

── GET /bench/item/42 ──
  Vanilla Bun     14150 req/s |  500 ok | p50  8.97 ms | p99 19.34 ms | err 0
  Vanilla Node    14422 req/s |  500 ok | p50  5.94 ms | p99 24.18 ms | err 0
  OgerJS (Bun)    24958 req/s |  500 ok | p50  2.12 ms | p99 12.68 ms | err 0
  OgerJS (Node)    8953 req/s |  500 ok | p50 11.29 ms | p99 31.38 ms | err 0
  Hono (Bun)      19171 req/s |  500 ok | p50  3.27 ms | p99 16.41 ms | err 0
  Hono (Node)     10856 req/s |  500 ok | p50  8.13 ms | p99 30.41 ms | err 0
  Elysia          18948 req/s |  500 ok | p50  3.67 ms | p99 16.69 ms | err 0
  Express          6404 req/s |  500 ok | p50 16.18 ms | p99 49.42 ms | err 0
  → fastest: OgerJS (Bun) (24958 req/s)

── GET /bench/auth ──
  Vanilla Bun     10523 req/s |  500 ok | p50  9.48 ms | p99 18.42 ms | err 0
  Vanilla Node    12767 req/s |  500 ok | p50  6.84 ms | p99 26.40 ms | err 0
  OgerJS (Bun)    21280 req/s |  500 ok | p50  2.63 ms | p99 14.91 ms | err 0
  OgerJS (Node)   12165 req/s |  500 ok | p50  6.92 ms | p99 27.87 ms | err 0
  Hono (Bun)      15998 req/s |  500 ok | p50  3.88 ms | p99 17.77 ms | err 0
  Hono (Node)      8708 req/s |  500 ok | p50 11.05 ms | p99 35.66 ms | err 0
  Elysia          17220 req/s |  500 ok | p50  3.16 ms | p99 20.52 ms | err 0
  Express          6569 req/s |  500 ok | p50 15.69 ms | p99 42.79 ms | err 0
  → fastest: OgerJS (Bun) (21280 req/s)

── GET /bench/async-io ──
  Vanilla Bun     18229 req/s |  500 ok | p50  3.15 ms | p99 17.50 ms | err 0
  Vanilla Node    10628 req/s |  500 ok | p50  7.79 ms | p99 27.73 ms | err 0
  OgerJS (Bun)    19716 req/s |  500 ok | p50  2.69 ms | p99 18.35 ms | err 0
  OgerJS (Node)   10080 req/s |  500 ok | p50  9.15 ms | p99 31.22 ms | err 0
  Hono (Bun)      15208 req/s |  500 ok | p50  4.41 ms | p99 19.04 ms | err 0
  Hono (Node)      8975 req/s |  500 ok | p50  9.53 ms | p99 35.00 ms | err 0
  Elysia          14953 req/s |  500 ok | p50  3.65 ms | p99 22.57 ms | err 0
  Express          5882 req/s |  500 ok | p50 16.56 ms | p99 52.31 ms | err 0
  → fastest: OgerJS (Bun) (19716 req/s)

── GET /bench/search (query) ──
  Vanilla Bun     17103 req/s |  500 ok | p50  3.17 ms | p99 19.11 ms | err 0
  Vanilla Node    11078 req/s |  500 ok | p50  7.38 ms | p99 34.78 ms | err 0
  OgerJS (Bun)    18810 req/s |  500 ok | p50  2.63 ms | p99 18.69 ms | err 0
  OgerJS (Node)   10519 req/s |  500 ok | p50  7.53 ms | p99 36.23 ms | err 0
  Hono (Bun)      14744 req/s |  500 ok | p50  4.22 ms | p99 20.44 ms | err 0
  Hono (Node)      9467 req/s |  500 ok | p50  8.16 ms | p99 39.41 ms | err 0
  Elysia          14960 req/s |  500 ok | p50  3.69 ms | p99 21.68 ms | err 0
  Express          6901 req/s |  500 ok | p50 14.01 ms | p99 43.61 ms | err 0
  → fastest: OgerJS (Bun) (18810 req/s)

── GET /bench/api/v1/accounts/42/balance ──
  Vanilla Bun      9552 req/s |  500 ok | p50  9.53 ms | p99 22.14 ms | err 0
  Vanilla Node    12083 req/s |  500 ok | p50  5.43 ms | p99 31.46 ms | err 0
  OgerJS (Bun)    16355 req/s |  500 ok | p50  2.62 ms | p99 23.72 ms | err 0
  OgerJS (Node)    9140 req/s |  500 ok | p50  9.55 ms | p99 28.90 ms | err 0
  Hono (Bun)      15356 req/s |  500 ok | p50  3.15 ms | p99 23.54 ms | err 0
  Hono (Node)      9612 req/s |  500 ok | p50  8.13 ms | p99 29.87 ms | err 0
  Elysia          14107 req/s |  500 ok | p50  3.17 ms | p99 25.97 ms | err 0
  Express          9217 req/s |  500 ok | p50 11.62 ms | p99 38.57 ms | err 0
  → fastest: OgerJS (Bun) (16355 req/s)

── GET /bench/middleware (chain) ──
  Vanilla Bun     12016 req/s |  500 ok | p50  9.12 ms | p99 12.38 ms | err 0
  Vanilla Node    20258 req/s |  500 ok | p50  4.22 ms | p99 18.91 ms | err 0
  OgerJS (Bun)    36495 req/s |  500 ok | p50  2.11 ms | p99  7.40 ms | err 0
  OgerJS (Node)   18018 req/s |  500 ok | p50  5.21 ms | p99 19.52 ms | err 0
  Hono (Bun)      24572 req/s |  500 ok | p50  4.19 ms | p99  9.34 ms | err 0
  Hono (Node)     12626 req/s |  500 ok | p50  7.42 ms | p99 28.69 ms | err 0
  Elysia          24535 req/s |  500 ok | p50  3.16 ms | p99 11.98 ms | err 0
  Express          8717 req/s |  500 ok | p50 10.12 ms | p99 40.35 ms | err 0
  → fastest: OgerJS (Bun) (36495 req/s)

── POST /bench/transfer ──
  Vanilla Bun     23616 req/s |  500 ok | p50  3.69 ms | p99 10.02 ms | err 0
  Vanilla Node    15613 req/s |  500 ok | p50  5.89 ms | p99 23.90 ms | err 0
  OgerJS (Bun)    32958 req/s |  500 ok | p50  2.11 ms | p99  8.23 ms | err 0
  OgerJS (Node)    8918 req/s |  500 ok | p50 10.59 ms | p99 36.02 ms | err 0
  Hono (Bun)      21646 req/s |  500 ok | p50  4.23 ms | p99 11.44 ms | err 0
  Hono (Node)      5661 req/s |  500 ok | p50 17.92 ms | p99 58.96 ms | err 0
  Elysia          13728 req/s |  500 ok | p50  5.33 ms | p99 23.02 ms | err 0
  Express          6588 req/s |  500 ok | p50 15.69 ms | p99 40.21 ms | err 0
  → fastest: OgerJS (Bun) (32958 req/s)

── POST /bench/large-json ──
  Vanilla Bun     14119 req/s |  500 ok | p50  7.39 ms | p99 13.72 ms | err 0
  Vanilla Node    10173 req/s |  500 ok | p50 10.02 ms | p99 27.07 ms | err 0
  OgerJS (Bun)    25488 req/s |  500 ok | p50  2.62 ms | p99 12.09 ms | err 0
  OgerJS (Node)    7868 req/s |  500 ok | p50 14.31 ms | p99 23.44 ms | err 0
  Hono (Bun)      13998 req/s |  500 ok | p50  6.34 ms | p99 15.22 ms | err 0
  Hono (Node)      5235 req/s |  500 ok | p50 20.42 ms | p99 58.60 ms | err 0
  Elysia          12810 req/s |  500 ok | p50  7.71 ms | p99 18.52 ms | err 0
  Express          5224 req/s |  500 ok | p50 21.29 ms | p99 51.82 ms | err 0
  → fastest: OgerJS (Bun) (25488 req/s)

── GET /bench/headers ──
  Vanilla Bun     21667 req/s |  500 ok | p50  3.19 ms | p99 13.32 ms | err 0
  Vanilla Node    18050 req/s |  500 ok | p50  4.73 ms | p99 15.69 ms | err 0
  OgerJS (Bun)    23979 req/s |  500 ok | p50  2.65 ms | p99 13.25 ms | err 0
  OgerJS (Node)   13187 req/s |  500 ok | p50  6.29 ms | p99 24.50 ms | err 0
  Hono (Bun)      19798 req/s |  500 ok | p50  3.28 ms | p99 15.15 ms | err 0
  Hono (Node)     11132 req/s |  500 ok | p50  7.97 ms | p99 31.15 ms | err 0
  Elysia          15123 req/s |  500 ok | p50  5.66 ms | p99 19.86 ms | err 0
  Express          7484 req/s |  500 ok | p50 14.09 ms | p99 37.08 ms | err 0
  → fastest: OgerJS (Bun) (23979 req/s)
```

### Throughput matrix (req/s)

| Target | ok | json-parse | json-serialize | route-param | auth | async-io | query | nested | middleware | validation | large-json | headers |
|--------|---:|-----------:|---------------:|------------:|-----:|---------:|------:|-------:|-----------:|-----------:|-----------:|--------:|
| **OgerJS (Bun)** | **39,708** | **32,533** | **26,164** | **24,958** | **21,280** | **19,716** | **18,810** | **16,355** | **36,495** | **32,958** | **25,488** | **23,979** |
| Vanilla Bun | 32,702 | 14,974 | 17,797 | 14,150 | 10,523 | 18,229 | 17,103 | 9,552 | 12,016 | 23,616 | 14,119 | 21,667 |
| Vanilla Node | 12,312 | 9,719 | 12,360 | 14,422 | 12,767 | 10,628 | 11,078 | 12,083 | 20,258 | 15,613 | 10,173 | 18,050 |
| OgerJS (Node) | 6,908 | 4,579 | 9,050 | 8,953 | 12,165 | 10,080 | 10,519 | 9,140 | 18,018 | 8,918 | 7,868 | 13,187 |
| Hono (Bun) | 23,929 | 14,779 | 18,951 | 19,171 | 15,998 | 15,208 | 14,744 | 15,356 | 24,572 | 21,646 | 13,998 | 19,798 |
| Hono (Node) | 9,393 | 2,972 | 9,080 | 10,856 | 8,708 | 8,975 | 9,467 | 9,612 | 12,626 | 5,661 | 5,235 | 11,132 |
| Elysia | 28,437 | 15,758 | 20,333 | 18,948 | 17,220 | 14,953 | 14,960 | 14,107 | 24,535 | 13,728 | 12,810 | 15,123 |
| Express | 5,237 | 3,377 | 5,875 | 6,404 | 6,569 | 5,882 | 6,901 | 9,217 | 8,717 | 6,588 | 5,224 | 7,484 |

Methodology and env vars: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

---

## Why OgerJS

| Capability | Detail |
|------------|--------|
| **Performance** | Native `Bun.serve` routes + compile-time specialization — see benchmarks above |
| **Zero core deps** | `@ogerjs/core` uses only Bun / Web APIs |
| **Enterprise plugins** | Security, observability, audit, idempotency, rate limits — opt-in via `.use()` |
| **Validation** | Built-in `t` schemas, RFC 7807 errors, `Static<T>` inference |
| **Testing** | In-process `app.inject()` — no sockets |
| **Cross-runtime** | Same routes on Bun and Node (`@ogerjs/core` fallback + `@ogerjs/compat`) |

---

## Quickstart

```bash
bun add ogerjs
```

```ts
import { Oger, t } from "ogerjs";

const app = new Oger()
  .get("/", () => "ok")
  .post(
    "/users",
    ({ body }) => body,
    { body: t.Object({ name: t.String({ minLength: 1 }) }) },
  )
  .listen(3000);
```

**New project**

```bash
bunx ogerjs my-api --yes
cd my-api && bun install && bun run start
```

**Monorepo development**

```bash
git clone <repo-url> ogerjs && cd ogerjs
bun install
bun test
bun run --cwd apps/example-basic start
```

---

## Repository layout

```
packages/          29 @ogerjs/* workspace packages (core + plugins)
apps/              Reference apps (basic, auth, banking, bench)
benchmark/         Go HTTP comparison harness + peer targets
docs/              Guides and architecture reference
scripts/           Build and maintenance tooling
```

Shipped packages and roadmap gaps: [docs/OVERVIEW.md](docs/OVERVIEW.md) · [docs/ENTERPRISE_ROADMAP.md](docs/ENTERPRISE_ROADMAP.md)

---

## Shipped packages (v0.2.0)

| Area | Packages |
|------|----------|
| **Core** | `@ogerjs/core`, `@ogerjs/router`, `@ogerjs/testing`, `create-oger` |
| **Security** | `cors`, `helmet`, `csrf`, `jwt`, `basic-auth`, `bearer`, `api-key`, `body-limit`, `cookie` |
| **HTTP** | `json`, `html`, `compress`, `etag`, `static`, `stream`, `upload` |
| **Ops** | `logger`, `request-id`, `health`, `audit-log`, `rate-limit`, `idempotency` |
| **Real-time** | `sse`, `ws`, `events` |
| **Runtime** | `compat` |

Full table with descriptions: [docs/OVERVIEW.md#package-table](docs/OVERVIEW.md#package-table)

---

## Examples

| App | Command | Focus |
|-----|---------|-------|
| Basic API | `bun run --cwd apps/example-basic start` | Routes + validation |
| Auth | `bun run --cwd apps/example-auth start` | JWT, API keys |
| Banking | `bun run --cwd apps/example-banking start` | REST + WebSocket + OpenAPI export |

Banking walkthrough: [docs/BANKING.md](docs/BANKING.md)

---

## Development

```bash
bun install          # Workspace deps
bun test packages    # Package tests
bun run typecheck    # TypeScript
bun run build        # Build all packages
cd benchmark && go run benchmark.go   # HTTP benchmark (see docs/BENCHMARKS.md)
```

CI runs on `main`, `master`, and `v0.2` branches.

---

## Benchmarks

Go runner: `benchmark/benchmark.go` — 8 runtimes × 12 banking-oriented scenarios.

```bash
bun run build
cd benchmark
go run benchmark.go
```

Methodology and env vars: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

---

## Publishing (Ogulcan Studio npm)

Everything ships as one [`ogerjs`](https://www.npmjs.com/package/ogerjs) package on the [ogulcanstudio](https://www.npmjs.com/~ogulcanstudio) npm account (framework, plugins, CLI).

```bash
npm login                    # log in as ogulcanstudio
bun run publish:packages     # dry-run pack check
bun run publish:packages -- --yes   # publish ogerjs only
```

---

## Documentation

| Guide | Topic |
|-------|-------|
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) | Install, concepts, commands |
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | Architecture, package map |
| [docs/CORE.md](docs/CORE.md) | `Oger` class, lifecycle, context |
| [docs/ROUTING.md](docs/ROUTING.md) | Routes, groups, guards, macros |
| [docs/VALIDATION.md](docs/VALIDATION.md) | `t` schemas |
| [docs/PLUGINS.md](docs/PLUGINS.md) | Plugin authoring |
| [docs/SECURITY.md](docs/SECURITY.md) | Helmet, CORS, CSRF, rate limits |
| [docs/AUTH.md](docs/AUTH.md) | JWT, Basic, API keys |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production checklist |
| [docs/BENCHMARKS.md](docs/BENCHMARKS.md) | Benchmark reference |
| [docs/BANKING.md](docs/BANKING.md) | Enterprise reference app |

Full index: [docs/README.md](docs/README.md)

---

## Security defaults

- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production
- CORS with `credentials: true` requires explicit origin allowlist
- JWT verification rejects wrong algorithms and expired tokens
- Static files: path traversal blocked
- Body parse errors: safe 4xx, no stack leaks

Details: [docs/SECURITY.md](docs/SECURITY.md)

---

## License

MIT — see [LICENSE](LICENSE). Copyright Ogulcan Studio.
