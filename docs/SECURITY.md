# Security

OgerJS ships security as composable workspace plugins (**v0.1.0**). Enable only what your app needs, in dependency order (e.g. `cookie` before session-based auth).

Shipped package list: [OVERVIEW.md](./OVERVIEW.md#security). Planned plugins (`ip-filter`, `bot-guard`): [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md).

## Feature map (shipped)

| Concern | Package | Usage |
|---------|---------|-------|
| Secure headers | `@ogerjs/helmet` | `.use(helmet())` |
| CORS | `@ogerjs/cors` | `.use(cors({ origin: [...] }))` |
| Rate limiting | `@ogerjs/rate-limit` | `.use(rateLimit({ max: 100 }))` |
| Adaptive rate limiting | `@ogerjs/rate-limit` | `.use(rateLimit({ max: 100, adaptive: true }))` |
| JWT bearer auth | `@ogerjs/jwt` | `.use(jwt({ secret }))` + `{ jwt: true }` |
| Cookie sign/encrypt | `@ogerjs/cookie` | `.use(cookie({ signed: true, secret }))` |
| CSRF | `@ogerjs/csrf` | `.use(csrf())` |
| Body size limit | `@ogerjs/body-limit` | `.use(bodyLimit({ maxSize }))` |
| Body size (core) | `@ogerjs/core` | `new Oger({ bodyLimit })` |
| API keys | `@ogerjs/api-key` | `.use(apiKey({ validate: [...] }))` + `{ apiKey: true }` |
| Audit trail | `@ogerjs/audit-log` | `.use(auditLog())` |
| Idempotency | `@ogerjs/idempotency` | `.use(idempotency())` |
| Pluggable auth | `@ogerjs/core` | `defineAuthPlugin` + `{ auth: true }` |

## Planned (roadmap)

| Concern | Package | Status |
|---------|---------|--------|
| IP allow/deny | `@ogerjs/ip-filter` | Planned |
| Bot protection | `@ogerjs/bot-guard` | Planned |

Core helpers: `timingSafeEqual`, `clientIp`, `isPathInsideRoot`, `normalizeRelativePath`, `escapeHeaderValue`.

## Helmet

Sets secure response headers with four presets targeting common deployment profiles:

```ts
import { helmet, helmetApiPreset, helmetDashboardPreset, helmetAdminPreset, helmetPublicWebsitePreset } from "@ogerjs/helmet";

// Default (strict API)
app.use(helmet());

// Presets
app.use(helmet(helmetApiPreset()));         // JSON APIs, no CSP/framing
app.use(helmet(helmetDashboardPreset()));   // SPA dashboards, inline scripts
app.use(helmet(helmetAdminPreset()));       // Admin consoles, HSTS enabled
app.use(helmet(helmetPublicWebsitePreset())); // Marketing sites, permissive fonts/images
```

### Preset Comparison

| Header | API | Dashboard | Admin | Public |
|--------|-----|-----------|-------|--------|
| CSP | `false` | `default-src 'self'; script-src 'self' 'unsafe-inline'` | `default-src 'self'; frame-ancestors 'none'` | `default-src 'self'; img-src 'self' https: data:` |
| X-Frame-Options | `DENY` | `SAMEORIGIN` | `DENY` | `SAMEORIGIN` |
| HSTS | auto | auto | `31536000; includeSubDomains` | auto |
| CORP | `same-origin` | `same-site` | `same-origin` | `cross-origin` |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `contentSecurityPolicy` | `"default-src 'self'"` | CSP header or `false` |
| `crossOriginEmbedderPolicy` | `"require-corp"` | COEP or `false` |
| `crossOriginOpenerPolicy` | `"same-origin"` | COOP or `false` |
| `crossOriginResourcePolicy` | `"same-origin"` | CORP or `false` |
| `referrerPolicy` | `"no-referrer"` | Referrer-Policy or `false` |
| `strictTransportSecurity` | auto (enabled in production) | HSTS or `false` |
| `xContentTypeOptions` | `"nosniff"` | X-Content-Type-Options |
| `xFrameOptions` | `"SAMEORIGIN"` | X-Frame-Options |
| `xDnsPrefetchControl` | `"off"` | X-DNS-Prefetch-Control |

## CORS

```ts
import { cors, buildCorsPolicy, validateCorsPolicy } from "@ogerjs/cors";

app.use(cors({
  origin: ["https://app.example.com"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
}));
```

With `credentials: true`, use an explicit origin list — never `*`. The plugin also registers `OPTIONS /*` → `204 No Content` for preflight requests.

### buildCorsPolicy

```ts
const policy = buildCorsPolicy({
  production: true,
  origin: ["https://app.example.com"],
  credentials: true,
});
// { origin: ["https://app.example.com"], methods: [...], credentials: true }
```

When `production === true` (or `NODE_ENV=production`), origin defaults to `false` (deny all).

### validateCorsPolicy

```ts
const warnings = validateCorsPolicy({ origin: "*", credentials: true });
// [{ code: "cors_credentials_wildcard", message: "..." }]
```

Returns warnings for unsafe configurations: credentials with wildcard origin, reflected origin, or missing custom headers.

## Rate Limit

Fixed-window in-memory rate limiter with optional adaptive mode:

```ts
import { rateLimit, createAdaptiveLimiter, AdaptiveLimiter } from "@ogerjs/rate-limit";

// Fixed window
app.use(rateLimit({ max: 100, windowMs: 60_000, trustProxy: true }));

// Adaptive mode — tightens limits based on suspicious behavior
app.use(rateLimit({
  max: 100,
  windowMs: 60_000,
  adaptive: {
    baseMax: 100,
    tightenThreshold: 10,    // suspicion score before tightening
    tightenFactor: 0.25,     // reduce to 25% of base when tightened
    decayFactor: 0.5,        // halve suspicion each window
  },
  trackNotFound: true,       // auto-record 404s as suspicion
}));
```

### Options

| Option | Type | Default |
|--------|------|---------|
| `max` | `number` | required |
| `windowMs` | `number` | `60000` |
| `keyGenerator` | `(ctx) => string` | client IP |
| `message` | `string` | `"Too Many Requests"` |
| `trustProxy` | `boolean` | `false` |
| `adaptive` | `AdaptiveLimiterOptions \| true` | undefined (fixed mode) |
| `trackNotFound` | `boolean` | `true` (adaptive only) |

### AdaptiveLimiter

```ts
const limiter = new AdaptiveLimiter({ baseMax: 100, windowMs: 60_000 });
limiter.recordSuspicion(key, { kind: "auth_failure", weight: 2 });
const result = limiter.consume(key);
// { allowed: boolean, max: number, remaining: number, resetAt: number, tightened: boolean, score: number }
```

Suspicion events: `not_found` (weight 1), `auth_failure` (2), `bad_ua` (1), `burst` (3).

## CSRF

Double-submit cookie pattern:

```ts
import { csrf } from "@ogerjs/csrf";

app.use(csrf({
  cookieName: "csrf",        // cookie storing the token
  headerName: "x-csrf-token", // request header carrying the token
  methods: ["POST", "PUT", "PATCH", "DELETE"],
  ignorePaths: ["/webhooks"],
}));
```

Safe methods receive a `Set-Cookie` with a new CSRF token when missing. Mutating methods validate the header token against the cookie token using `timingSafeEqual`. Returns 403 on mismatch.

## Body Limit

Early rejection of oversized request bodies with per-route, content-type, and tenant rules:

```ts
import { bodyLimit, resolveBodyLimit, type RouteBodyLimitRule } from "@ogerjs/body-limit";

app.use(bodyLimit({
  maxSize: 1_048_576,       // 1 MB global limit
  tenantHeader: "x-tenant-id",
  rules: [
    { path: "/uploads", maxSize: 10 * 1_048_576 },              // 10 MB for uploads
    { path: "/api", maxSize: 256 * 1024, contentType: "application/json" }, // 256 KB for JSON
    { path: "/enterprise", maxSize: 100 * 1_048_576, tenantHeader: "x-tenant-id" }, // per-tenant
  ],
}));
```

Only checks mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`). Validates `Content-Length` before handler runs. Returns 400 on invalid Content-Length, 413 on oversize.

### RouteBodyLimitRule

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Path prefix or exact path |
| `maxSize` | `number` | Max bytes for matching requests |
| `contentType` | `string` | Optional content-type prefix match |
| `tenantHeader` | `string` | Optional — applies rule only when header present |

## IP filter and bot guard (roadmap)

`@ogerjs/ip-filter` and `@ogerjs/bot-guard` are not in v0.1.0. Until they ship, enforce IP rules at the reverse proxy or in `beforeHandle` using `clientIp()` from `@ogerjs/core`. Track status in [ENTERPRISE_ROADMAP.md](./ENTERPRISE_ROADMAP.md).

## Recommended stack (API)

```ts
app
  .use(requestId())
  .use(logger())
  .use(helmet(helmetApiPreset()))
  .use(cors({ origin: allowedOrigins }))
  .use(rateLimit({ max: 100, trustProxy: true }))
  .use(bodyLimit({ maxSize: 1_048_576 }))
  .use(auditLog());
```

Add `jwt`, `apiKey`, or `defineAuthPlugin` per route. Add `csrf` when using cookie sessions in browsers.

See also: [AUTH.md](./AUTH.md), [PLUGINS.md](./PLUGINS.md)
