# Enterprise Plugins

OgerJS ships 20+ enterprise-grade plugins for auth, security, rate limiting, billing, feature flags, and more. Each is a standalone `@ogerjs/*` package that plugs into the pipeline via `app.use()`.

## Authentication & Authorization

| Plugin | Package | Type Signature |
|--------|---------|----------------|
| API Key | `@ogerjs/api-key` | `apiKey({ validate, header?, query? })` |
| Basic Auth | `@ogerjs/basic-auth` | `basicAuth({ username, password, realm?, verifyUser? })` |
| Bearer Token | `@ogerjs/bearer` | `bearer()` — derives `ctx.bearer`, macro `bearer` guard |
| JWT | `@ogerjs/jwt` | `jwt({ secret, exp? })` — `ctx.jwt.sign/verify` + macro |

```ts
// API Key — header or query, timing-safe compare
app.use(apiKey({ validate: ["sk-xxx"], header: "x-api-key" }));

// JWT — HS256, configurable expiry
app.use(jwt({ secret: process.env.JWT_SECRET!, exp: "24h" }));
// Route guard via macro: app.get("/admin", handler, { macro: { jwt: true } })
```

## Security

| Plugin | Package | Description |
|--------|---------|-------------|
| CORS | `@ogerjs/cors` | Configurable origin, methods, credentials; `buildCorsPolicy()` for prod-safe defaults; `validateCorsPolicy()` for warnings |
| CSRF | `@ogerjs/csrf` | Double-submit cookie pattern, configurable methods/ignore paths |
| Helmet | `@ogerjs/helmet` | 9 security headers; presets: `helmetApiPreset`, `helmetDashboardPreset`, `helmetAdminPreset`, `helmetPublicWebsitePreset` |
| Body Limit | `@ogerjs/body-limit` | Max request body size per route/content-type/tenant |
| Bot Guard | `@ogerjs/bot-guard` | User-Agent allow/deny, heuristic scripted detection, fingerprint hook |
| IP Filter | `@ogerjs/ip-filter` | Allow/deny client IPs, optional `x-forwarded-for` trust |

```ts
app.use(helmet(helmetAdminPreset())); // strict framing + CSP
app.use(cors({ origin: "https://app.example.com", credentials: true }));
app.use(csrf({ cookieName: "csrf", headerName: "x-csrf-token" }));
app.use(bodyLimit({ maxSize: 1_000_000, rules: [{ path: "/upload", maxSize: 50_000_000 }] }));
```

## Rate Limiting & Quotas

| Plugin | Package | Type Signature |
|--------|---------|----------------|
| Rate Limit | `@ogerjs/rate-limit` | `rateLimit({ max, windowMs?, keyGenerator?, message?, trustProxy? })` |
| Adaptive Rate Limit | `@ogerjs/rate-limit` (adaptive) | `rateLimit({ max, adaptive: true })` — tightens limit based on suspicion score |
| Quota | `@ogerjs/quota` | `quota({ plans, store?, resolveSubject })` — per-plan request counters |

```ts
// Fixed window
app.use(rateLimit({ max: 100, windowMs: 60_000 }));

// Adaptive — tightens limit when score exceeds threshold
app.use(rateLimit({ max: 100, adaptive: { baseMax: 100, tightenThreshold: 10 } }));
// Tracks 404s and bad UA as suspicion signals

// Per-plan usage quotas
app.use(quota({
  plans: { free: { id: "free", requestsPerMonth: 10_000 } },
  resolveSubject: (ctx) => ({ tenantId: ctx.headers["x-tenant-id"], planId: "free" }),
}));
```

## Feature Management

| Plugin | Package | Type Signature |
|--------|---------|----------------|
| Feature Flags | `@ogerjs/flags` | `featureFlags({ flags, resolveContext? })` |
| A/B Testing | `@ogerjs/ab-test` | `abTest({ experiments, subjectKey? })` |

```ts
app.use(featureFlags({
  flags: { newDashboard: { enabled: true, tenants: ["enterprise"] } },
}));
// ctx.isFlagEnabled("newDashboard")

app.use(abTest({
  experiments: [{ name: "signup-flow", variants: [{ id: "v1", weight: 50 }, { id: "v2", weight: 50 }] }],
}));
// ctx.experimentVariants["signup-flow"]
```

## Audit & Compliance

| Plugin | Package | Description |
|--------|---------|-------------|
| Audit Log | `@ogerjs/audit-log` | Typed events (auth/admin/data/permission/security), pluggable sink, auto-redact |
| Billing | `@ogerjs/billing` | Usage event recording with `recordUsage()` helper |

```ts
app.use(auditLog({ sink: mySink, path: "/audit/events" }));
// In handler:
audit(ctx, { type: "auth", action: "user.login", success: true });

app.use(billing({ sink: myUsageSink }));
recordUsage(ctx, { name: "api-call", tenantId: "t1", quantity: 1 });
```

## Reliability & Resilience

| Plugin | Package | Description |
|--------|---------|-------------|
| Idempotency | `@ogerjs/idempotency` | Deduplicate POST/PUT/PATCH via idempotency-key header; `dedupeConcurrent()` helper |
| Circuit Breaker | `@ogerjs/circuit-breaker` | `CircuitBreaker` class with closed/open/half-open states; `withCircuit()` helper |
| Chaos | `@ogerjs/chaos` | Simulated latency, random errors, DB/Redis failures for testing |
| Shutdown | `@ogerjs/shutdown` | Graceful shutdown with `SIGINT`/`SIGTERM` handlers, timeout, hook registry |

```ts
app.use(idempotency({ header: "idempotency-key", store: myRedisStore }));
// Auto-deduplicates concurrent requests with same key

const breaker = new CircuitBreaker({ failureThreshold: 5, openMs: 30_000 });
const result = await withCircuit(breaker, () => fetch("http://upstream/api"));

app.use(chaos({ latencyMs: 100, errorRate: 0.1, enabled: process.env.NODE_ENV !== "production" }));
app.use(shutdown({ timeoutMs: 10_000 }));
```

## Webhooks

| Plugin | Package | Description |
|--------|---------|-------------|
| Webhook Receiver | `@ogerjs/webhook` | Signature verification (SHA-256), deduplication via delivery ID, in-memory store, event listing UI |

```ts
app.use(webhook({
  secret: process.env.WEBHOOK_SECRET!,
  path: "/webhooks/inbound",
  signatureHeader: "x-signature",
  deliveryIdHeader: "x-delivery-id",
}));
// POST /webhooks/inbound — verify + store
// GET /webhooks/events — list recent
// GET /webhooks/ui — HTML dashboard
```

## Presets

Pre-configured stacks via `@ogerjs/presets`:

```ts
import { enterprisePreset, saasPreset, microservicePreset } from "@ogerjs/presets";

enterprisePreset(app);   // requestId + helmet + cors + rateLimit + auditLog + openapi
saasPreset(app);         // enterprisePreset + quota + apiKey
microservicePreset(app); // shutdown + metrics + otel + health
```
