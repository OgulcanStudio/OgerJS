# Benchmarks

OgerJS includes a multi-target HTTP comparison benchmark under `benchmark/` and package-level route benchmarking via `@ogerjs/testing`.

## HTTP Comparison Benchmark

Single Go runner (`benchmark/benchmark.go`) + peer servers under `benchmark/targets/`.

```bash
bun run build
cd benchmark
go run benchmark.go
```

### Methodology

| Phase | Default | Purpose |
|-------|---------|---------|
| Warmup | `BENCH_WARMUP=50` | GET `/` per target — not scored |
| Burst | `BENCH_REQUESTS=500` | Async requests per target per category |

**Client:** Go `net/http` with keep-alive, up to `BENCH_CONCURRENCY` (default 128) parallel requests per target.

**Target order:** By default each target is load-tested **sequentially** within a category (fair CPU on shared hosts). Set `BENCH_PARALLEL=1` to burst all targets at once (stress mode; results are noisier on Windows/macOS laptops).

### Targets (`benchmark/targets/`)

| Folder | Port | Runtime |
|--------|------|---------|
| vanillabun | 3001 | Bun `Bun.serve` |
| vanillanode | 3002 | Node `http` |
| ogerjs | 3003 | Bun + `@ogerjs/core` |
| ogerjsnode | 3007 | Node + `@ogerjs/core` |
| honojs | 3004 | Bun + Hono |
| honojsnode | 3008 | Node + Hono |
| elysiajs | 3005 | Bun + Elysia |
| expressjs | 3006 | Node + Express |

OgerJS on Node uses the built-in `http`/`https` fallback from `@ogerjs/core` — same routes and workspace plugins as Bun (see `docs/BANKING.md`).

### Scenarios (12 categories)

| Key | Method | Path |
|-----|--------|------|
| `ok` | GET | `/` |
| `json-parse` | POST | `/bench/json-parse` |
| `json-serialize` | GET | `/bench/json-serialize` |
| `route-param` | GET | `/bench/item/42` |
| `auth` | GET | `/bench/auth` |
| `async-io` | GET | `/bench/async-io` |
| `query` | GET | `/bench/search?q=acct&limit=50&cursor=abc` |
| `nested` | GET | `/bench/api/v1/accounts/42/balance` |
| `middleware` | GET | `/bench/middleware` |
| `validation` | POST | `/bench/transfer` |
| `large-json` | POST | `/bench/large-json` |
| `headers` | GET | `/bench/headers` |

Banking-oriented cases: `auth`, `validation`, `nested`, `large-json`, `headers`.

### Run options

```bash
# CI smoke (Bun + Node OgerJS)
BENCH_TARGETS=ogerjs,ogerjsnode,vanillabun BENCH_CATEGORIES=ok,auth BENCH_REQUESTS=100 go run benchmark.go

# Compare OgerJS Bun vs Node only
BENCH_TARGETS=ogerjs,ogerjsnode go run benchmark.go

# JSON report
BENCH_JSON_PATH=./last-run.json go run benchmark.go
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BENCH_REQUESTS` | 500 | Burst size per target per category |
| `BENCH_CONCURRENCY` | 128 | Max parallel requests per target |
| `BENCH_WARMUP` | 50 | Warmup requests per target |
| `BENCH_TARGETS` | all | Comma filter by folder name or port |
| `BENCH_CATEGORIES` | all twelve | Comma-separated scenario keys |
| `BENCH_JSON_PATH` | off | JSON report output path |
| `BENCH_TARGET_LOG_DIR` | off | Optional dir for per-target server logs (debug only) |
| `BENCH_FAIL_ON_ERROR` | off | Exit non-zero on HTTP errors |
| `BENCH_PARALLEL` | off | `1` = load all targets simultaneously per category |

## CI

Root workflow runs a smoke burst against `ogerjs` + `vanillabun` (`ok` + `auth`).

## Package-level benchmarks

`@ogerjs/testing` provides `benchRoute()` via `inject()` for in-process route timing without sockets.
