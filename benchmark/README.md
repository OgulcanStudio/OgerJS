# HTTP Benchmark

Single Go runner + `targets/` subprojects. Starts every API, then **burst-loads all targets in parallel**.

## Layout

```
benchmark/
  benchmark.go      ← run this
  go.mod
  targets/
    shared/workload.js
    ogerjs/         Bun + @ogerjs/core
    ogerjsnode/     Node + @ogerjs/core (100% feature parity)
    honojs/         Bun + Hono
    honojsnode/     Node + Hono + @hono/node-server
    elysiajs/
    expressjs/
    vanillabun/
    vanillanode/
```

## Run

From repo root (build Oger first):

```bash
bun install
bun run build
cd benchmark
go run benchmark.go
```

Or from root:

```bash
bun run benchmark
```

## Defaults

- **500** async requests per target per category (`BENCH_REQUESTS`)
- **128** max in-flight per target (`BENCH_CONCURRENCY`)
- All **8 targets** × **12 categories** (sequential per target by default; `BENCH_PARALLEL=1` for simultaneous load)

## Scenarios (banking-relevant workloads)

| Key | Method | Path | What it measures |
|-----|--------|------|------------------|
| `ok` | GET | `/` | Plain ping |
| `json-parse` | POST | `/bench/json-parse` | Request body parse |
| `json-serialize` | GET | `/bench/json-serialize` | Response JSON encode |
| `route-param` | GET | `/bench/item/42` | Single path param |
| `auth` | GET | `/bench/auth` | Bearer token gate |
| `async-io` | GET | `/bench/async-io` | Async crypto digest |
| `query` | GET | `/bench/search?...` | Query string parse |
| `nested` | GET | `/bench/api/v1/accounts/42/balance` | Nested REST path |
| `middleware` | GET | `/bench/middleware` | Middleware chain |
| `validation` | POST | `/bench/transfer` | Schema / transfer validation |
| `large-json` | POST | `/bench/large-json` | Batch transaction payload |
| `headers` | GET | `/bench/headers` | Request header inspection |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `BENCH_REQUESTS` | `500` | Burst size per target per category |
| `BENCH_CONCURRENCY` | `128` | Max parallel requests per target |
| `BENCH_WARMUP` | `50` | Warmup GET `/` per target before measure |
| `BENCH_TARGETS` | all | Filter: `ogerjs,ogerjsnode,honojs` or port `3003` |
| `BENCH_CATEGORIES` | all twelve | `ok,auth,validation,...` |
| `BENCH_JSON_PATH` | off | Write JSON report path |
| `BENCH_TARGET_LOG_DIR` | off | Optional dir for per-target server logs (debug only) |
| `BENCH_FAIL_ON_ERROR` | off | Exit 1 if any HTTP errors |

## Smoke (CI)

```bash
BENCH_TARGETS=ogerjs,ogerjsnode,vanillabun BENCH_CATEGORIES=ok,auth BENCH_REQUESTS=100 BENCH_FAIL_ON_ERROR=1 go run benchmark.go
```

## Ports

| Folder | Port | Runtime |
|--------|------|---------|
| vanillabun | 3001 | Bun |
| vanillanode | 3002 | Node |
| ogerjs | 3003 | Bun |
| honojs | 3004 | Bun |
| elysiajs | 3005 | Bun |
| expressjs | 3006 | Node |
| ogerjsnode | 3007 | Node |
| honojsnode | 3008 | Node |

## Banking

Scenarios mirror common API patterns (auth, validation, nested accounts, batch JSON, headers). Full banking stack: `apps/example-banking` + `docs/BANKING.md`. OgerJS runs on **Bun and Node** with the same workspace plugins.
