# Error Handling

OgerJS provides structured error handling built on RFC 7807 Problem Details (`application/problem+json`). Errors flow through a typed class hierarchy and map to consistent JSON responses via `errorToResponse()`.

**Source files:** `packages/core/src/error.ts`, `problem.ts`

## Error Classes

### OgerError

Base class for all framework errors — extends `Error`:

```ts
class OgerError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly details?: unknown,
    public readonly type?: string,
  ) {
    super(message);
    this.name = "OgerError";
  }
}
```

Throw anywhere in a handler or hook:

```ts
import { OgerError } from "@ogerjs/core";

app.get("/users/:id", async ({ params }) => {
  const user = await db.findUser(params.id);
  if (!user) throw new OgerError("User not found", 404, "USER_NOT_FOUND");
  return user;
});
```

### ValidationError

Extends `OgerError` with structured `issues`:

```ts
class ValidationError extends OgerError {
  constructor(public readonly issues: ValidationIssue[]) {
    super("Validation failed", 422, "VALIDATION_ERROR", { issues });
    this.name = "ValidationError";
  }
}

interface ValidationIssue {
  type: string;          // "string" | "number" | "object" | "custom" | ...
  property: string;      // "body/name" | "query/page"
  message: string;       // human-readable
  expected?: string;     // optional hint
}
```

### status() — Quick Throw

```ts
import { status } from "@ogerjs/core";

app.get("/admin/:id", ({ params }) => {
  if (!isValid(params.id)) status(400, "Invalid ID");
  // never returns — always throws OgerError
});
```

## errorToResponse()

Maps any error to an RFC 7807 response (`error.ts:88`):

```ts
function errorToResponse(err: unknown, instance?: string): Response;
```

Dispatch logic:

| Error type | Status | Handler |
|------------|--------|---------|
| `ValidationError` | 422 | `validationResponse()` — structured issues array |
| `OgerError` | `err.status` | `ogerErrorResponse()` — problem details from error fields |
| `Error` | 500 | `problemDetailsResponse()` with generic mapping |
| Other | 500 | `internalErrorProblem()` — "An unexpected error occurred." |

## RFC 7807 Problem Details

`packages/core/src/problem.ts`:

### PROBLEM_JSON Constant

```ts
const PROBLEM_JSON = "application/problem+json";
```

Used as the `content-type` on all error responses.

### ProblemDetails Interface

```ts
interface ProblemDetails {
  type?: string;                   // URI or URN (default "about:blank")
  title: string;                   // human-readable
  status: number;                  // HTTP status
  detail?: string;                 // explanation
  instance?: string;               // request path
  [extension: string]: unknown;    // extensions (code, issues, errors, etc.)
}
```

### problemDetailsResponse()

Core response builder:

```ts
function problemDetailsResponse(
  problem: ProblemDetails,
  options?: ProblemResponseOptions,
): Response;

interface ProblemResponseOptions {
  instance?: string;
  extensions?: Record<string, unknown>;
}
```

Returns `Response.json(body, { status, headers: { "content-type": PROBLEM_JSON } })`.

### Convenience Helpers

```ts
// 404 — "No route matches the request path."
notFoundProblem(instance?: string): Response

// 500 — "An unexpected error occurred."
internalErrorProblem(detail?: string): Response
```

### ogerErrorResponse()

Maps `OgerError` to a Problem Details response:

```ts
function ogerErrorResponse(err: OgerError, instance?: string): Response;
```

The `type` field is constructed as `urn:ogerjs:problem:${code.toLowerCase()}:${status}`. Error details are included only in non-production environments (`NODE_ENV !== "production"`).

### validationResponse()

Maps `ValidationIssue[]` to a 422 Problem Details response:

```ts
function validationResponse(issues: ValidationIssue[], instance?: string): Response;
```

Response shape:

```json
{
  "type": "urn:ogerjs:problem:validation_error:422",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields failed validation.",
  "code": "VALIDATION_ERROR",
  "issues": [
    {
      "type": "string",
      "property": "body/name",
      "message": "Expected string"
    }
  ]
}
```

## onError Lifecycle Hook

Intercept errors before the default handler:

```ts
app.onError(async (ctx) => {
  const err = ctx.pendingResult; // the thrown error
  if (err instanceof OgerError && err.status === 404) {
    return new Response("Custom not found", { status: 404 });
  }
  // Return undefined to fall through to errorToResponse
});
```

Execution order in the pipeline (`pipeline.ts:252`):

```
catch (err) {
  for (const h of [...globalError, ...localError]) {
    const r = await h(ctx);
    if (r !== undefined) return toResponse(r);  // hook handled it
  }
  return errorToResponse(err);  // fallback
}
```

Hooks run in order: global hooks first, then local (per-route) hooks. The first hook that returns a non-undefined value wins. If no hook handles it, `errorToResponse()` produces the final response.

## Error Handling in Plugins

Plugins register `onError` hooks via `.on()`. Since plugin hooks merge into the parent app, they participate in the same error flow:

```ts
// Plugin registers global error handler
app.onError(async (ctx) => {
  const err = ctx.pendingResult;
  if (err instanceof OgerError && err.code === "RATE_LIMITED") {
    ctx.set.headers = { "Retry-After": "60" };
  }
});
```

Scoping rules apply:
- `"global"` hooks merge to parent unconditionally
- `"scoped"` hooks merge only when parent scope is also scoped or global
- `"local"` hooks stay on the child and merge when the plugin is used

## Pipeline Error Flow

```
Handler/Hook throws
  ↓
onError hooks (global → local)
  ↓  (if hook returns Response, finalize + return)
errorToResponse(err)
  ↓
ValidationError → validationResponse() → 422
OgerError      → ogerErrorResponse()  → err.status
Error          → problemDetailsResponse() → 500
Other          → internalErrorProblem()  → 500
  ↓
[finally] onAfterResponse hooks always run
```

## Error Integration with Validation

Validation errors are the most common error type. When a route defines a schema:

```ts
app.post("/users", handler, {
  body: t.Object({
    name: t.String({ minLength: 1 }),
    email: t.String({ format: "email" }),
    age: t.Optional(t.Integer({ min: 0, max: 150 })),
  }),
});
```

The pipeline automatically validates each field and returns a 422 response with detailed `issues`. Each issue includes:
- `type` — the schema kind that failed (e.g., `"string"`, `"number"`, `"enum"`)
- `property` — dot-path location (e.g., `"body/name"`, `"body/email"`)
- `message` — human-readable failure description
- `expected` — optional hint of expected value

Validation runs after body parsing and `transform` hooks but before `beforeHandle`.

## Custom Error Types

Extend `OgerError` for application-specific errors:

```ts
class AppError extends OgerError {
  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message, status, code, details);
    this.name = "AppError";
  }
}

app.get("/orders/:id", async ({ params }) => {
  const order = await db.findOrder(params.id);
  if (!order) throw new AppError("ORDER_NOT_FOUND", 404, "Order does not exist");
  if (order.status === "cancelled") {
    throw new AppError("ORDER_CANCELLED", 409, "Order was cancelled", { orderId: params.id });
  }
  return order;
});
```

Custom error classes integrate automatically with `errorToResponse()` via `instanceof OgerError`.

## Production vs Development

- `NODE_ENV !== "production"`: error `details` are included in Problem Details responses
- `NODE_ENV === "production"`: `details` are stripped to prevent information leakage
- Custom `onError` hooks can implement their own environment-aware logic

## Cross-References

- [VALIDATION.md](./VALIDATION.md) — Schema builder, compileSchema, validation flow
- [CORE.md](./CORE.md) — Lifecycle hooks, Oger class, context
- [ROUTING.md](./ROUTING.md) — Pipeline compilation, hook execution order
- [OVERVIEW.md](./OVERVIEW.md) — Architecture overview
