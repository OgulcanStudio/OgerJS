# Auth Integration

OgerJS splits authentication across composable plugins. Each auth plugin registers a macro that protects routes via declarative flags.

## defineAuthPlugin

The pluggable auth interface for external session stores, OIDC providers, or custom auth logic:

```ts
import { Oger, defineAuthPlugin, type AuthResolveResult, type AuthResolveFn } from "@ogerjs/core";

const sessionAuth = defineAuthPlugin({ name: "@myapp/session-auth" }, () => ({
  resolve: async (ctx) => {
    const session = ctx.cookie.session?.value;
    const user = await loadUser(session);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return { user };
  },
}));

new Oger()
  .use(sessionAuth())
  .get("/me", ({ user }) => user, { auth: true });
```

### AuthPluginSetup

```ts
interface AuthPluginSetup {
  macroName?: string;       // Route flag name. Default: "auth"
  resolve: AuthResolveFn;   // Returns context to merge or Response to short-circuit
  decorate?: Record<string, unknown>;  // Decorators to add to context
  macro?: Omit<MacroDefinition, "resolve">;  // Extra macro fields (schemas, beforeHandle)
}
```

### AuthResolveFn

```ts
type AuthResolveFn = (
  ctx: Context,
) => AuthResolveResult | Response | Promise<AuthResolveResult | Response>;
```

Return a `Record<string, unknown>` to merge into the request context. Return a `Response` (e.g. `Response.json({ error: "Unauthorized" }, { status: 401 })`) to short-circuit.

## JWT Plugin

```ts
import { jwt, signJwt, verifyJwt } from "@ogerjs/jwt";

const auth = jwt({ secret: process.env.JWT_SECRET!, exp: "1h" });

new Oger()
  .use(auth)
  .get("/me", (ctx) => ctx.jwt, { jwt: true });
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | required | Signing key (min 16 chars) |
| `exp` | `string` | `"1h"` | Token expiry (`30m`, `2h`, `7d`) |

### Methods

| Function | Signature | Description |
|----------|-----------|-------------|
| `signJwt` | `(payload, secret, exp?) => Promise<string>` | Create a signed JWT |
| `verifyJwt` | `(token, secret) => Promise<Record<string, unknown> \| null>` | Verify and decode |

### Decorations

`ctx.jwt` — the decoded JWT payload when `{ jwt: true }` is set:
```ts
interface JwtDecorator {
  sign: (payload: Record<string, unknown>) => Promise<string>;
  verify: (token: string) => Promise<Record<string, unknown> | null>;
}
```

Uses `HS256` (HMAC-SHA256). Expiration and algorithm rejection are enforced in `verifyJwt`.

## Cookie Plugin

```ts
import { cookie, signCookieValue, unsignCookieValue, encryptCookieValue, decryptCookieValue } from "@ogerjs/cookie";

// Signing only (HMAC-SHA256)
app.use(cookie({ signed: true, secret: process.env.COOKIE_SECRET! }));

// Encryption only (AES-256-GCM)
app.use(cookie({ encrypted: true, secret: process.env.COOKIE_SECRET! }));

// Both: sign then encrypt on write; decrypt then verify on read
app.use(cookie({ signed: true, encrypted: true, secret: process.env.COOKIE_SECRET! }));

// Read cookies
app.get("/check", (ctx) => ctx.cookie.session?.value);

// Set cookies
app.post("/login", ({ set }) => {
  set.cookie = {
    session: { value: "token", httpOnly: true, maxAge: 3600, path: "/", sameSite: "strict" },
  };
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `signed` | `boolean` | HMAC-SHA256 signing on read/write |
| `encrypted` | `boolean` | AES-256-GCM encryption on read/write |
| `secret` | `string` | Required when signed or encrypted (min 16 chars) |

### Helpers

| Function | Description |
|----------|-------------|
| `signCookieValue(value, secret)` | HMAC-SHA256 sign with base64url payload |
| `unsignCookieValue(value, secret)` | Verify and return original, or null |
| `encryptCookieValue(value, secret)` | AES-256-GCM encrypt with random IV |
| `decryptCookieValue(value, secret)` | Decrypt or return null |

### ctx.set.cookie

```ts
ctx.set.cookie = {
  session: {
    value: string;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
  },
};
```

## Bearer Token Extraction

```ts
import { bearer } from "@ogerjs/bearer";

new Oger()
  .use(bearer())
  .get("/api", ({ bearer }) => bearer)
  .get("/protected", handler, { bearer: true }); // macro: requires token
```

`ctx.bearer` contains the raw token from the `Authorization: Bearer <token>` header.

## Basic Auth Plugin

```ts
import { basicAuth } from "@ogerjs/basic-auth";

app.use(basicAuth({
  username: "admin",
  password: "secret",
  realm: "Admin Area",
}));
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `username` | `string` | Expected username |
| `password` | `string` | Expected password |
| `realm` | `string` | WWW-Authenticate realm (default: "secure area") |
| `verifyUser` | `(user, pass) => boolean \| Promise<boolean>` | Custom verifier |

When credentials are valid, `ctx.basicAuth` is set to `{ username }`. Uses `timingSafeEqual` for comparison. Returns 401 with `WWW-Authenticate` header on failure.

## API Key Plugin

```ts
import { apiKey } from "@ogerjs/api-key";

app.use(apiKey({
  validate: [process.env.SERVICE_KEY!],  // string[] or (key) => boolean
  header: "x-api-key",                    // default header name
  query: "api_key",                       // optional query param lookup
}));
app.get("/v1/data", () => data, { apiKey: true });
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `header` | `string` | Header name (default: `x-api-key`) |
| `query` | `string` | Query parameter name (optional) |
| `validate` | `string[] \| ((key) => boolean \| Promise<boolean>)` | Valid keys or custom verifier |

Uses `timingSafeEqual` for array comparisons. `ctx.apiKey` contains the extracted key value.

## Route-Level Auth Macros

Routes can declare auth requirements via boolean or object flags:

```ts
app
  .get("/public", publicHandler)                    // no auth
  .get("/me", meHandler, { jwt: true })              // JWT required
  .get("/admin", adminHandler, { apiKey: true })     // API key required
  .get("/dashboard", dashHandler, { auth: true })    // custom auth plugin
  .get("/api", apiHandler, { bearer: true })         // bearer token required
  .post("/data", dataHandler, { auth: { roles: ["admin"] } }); // auth with options
```

When a macro flag is truthy, the macro's `resolve` or `beforeHandle` runs before the handler. Returning a `Response` from `resolve` short-circuits the request.

See also: [SECURITY.md](./SECURITY.md) for CSRF, rate limiting, IP filtering, and other security features.
