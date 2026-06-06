# Validation

OgerJS includes a built-in schema system (`t` builder) for runtime validation with full TypeScript inference. Schemas compile to fast validator functions. Validation failures return RFC 7807 `application/problem+json` responses with structured `issues`.

**Source files:** `packages/core/src/schema/` (types.ts, compile.ts, index.ts, adapter.ts), `error.ts`, `problem.ts`

## Schema Builder (`t`)

Exported from `@ogerjs/core` and `packages/core/src/schema/index.ts`:

```ts
import { t, type Static } from "@ogerjs/core";
```

### Primitives

| Builder | TS Type | Options |
|---------|---------|---------|
| `t.String(opts?)` | `string` | `minLength`, `maxLength`, `pattern`, `format` |
| `t.Number(opts?)` | `number` | `min`, `max` |
| `t.Integer(opts?)` | `number` | `min`, `max` |
| `t.Boolean()` | `boolean` | — |
| `t.Literal(val)` | literal type | `val: string \| number \| boolean` |
| `t.Enum(values)` | union of literals | `values: readonly [string, ...string[]]` |

```ts
t.String({ minLength: 1, maxLength: 255, pattern: "^[a-z]+$", format: "email" })
t.Number({ min: 0, max: 100 })
t.Integer({ min: 1 })
t.Boolean()
t.Literal("active" as const)         // type: "active"
t.Enum(["admin", "user"] as const)   // type: "admin" | "user"
```

### SchemaOptions

```ts
interface SchemaOptions {
  minLength?: number;       // string
  maxLength?: number;       // string
  pattern?: string;         // string — RegExp test
  format?: "email" | "uri" | "uuid" | "date-time";  // string
  min?: number;             // number, integer
  max?: number;             // number, integer
  default?: unknown;        // not yet implemented at runtime
}
```

### Objects

```ts
const UserSchema = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ format: "email" }),
  age: t.Optional(t.Integer({ min: 0 })),
  roles: t.Array(t.Enum(["user", "admin"] as const)),
}, {
  required: ["name", "email"],         // defaults to non-optional keys
  additionalProperties: false,         // not yet enforced at runtime
});
```

### Arrays & Tuples

```ts
t.Array(t.String())                   // string[]
t.Tuple([t.String(), t.Number()])      // [string, number]
```

### Unions, Optional, Nullable

```ts
t.Union([t.String(), t.Number()])     // string | number
t.Optional(t.String())                 // string | undefined
t.Nullable(t.String())                 // string | null
```

### Records & Special Types

```ts
t.Record(t.String())                   // Record<string, string>
t.Any()                                // unknown — no validation
t.Unknown()                            // unknown — no validation
t.File()                               // File
t.Files()                              // File[]
t.Custom(validator)                    // custom validator function
```

### Custom Validators

Wrap arbitrary validation logic:

```ts
const PositiveInt = t.Custom((input: unknown, path?: string) => {
  if (typeof input !== "number" || !Number.isInteger(input) || input <= 0)
    return { success: false, issues: [{ type: "custom", property: path ?? "", message: "Expected positive integer" }] };
  return { success: true, value: input };
});
```

Type: `Validator<T> = (input: unknown, path?: string) => ValidatorResult<T>`

## Route Schema Definition

Schemas attach to routes via the options object in any HTTP method handler:

```ts
app.post("/users", handler, {
  body: t.Object({ name: t.String() }),
  query: t.Object({ ref: t.Optional(t.String()) }),
  params: t.Object({ id: t.String() }),
  headers: t.Object({ authorization: t.String() }),
  cookie: t.Object({ session: t.String() }),
  response: t.Object({ id: t.String(), name: t.String() }),
});
```

Alternatively via the `schema` key:

```ts
app.post("/users", handler, {
  schema: {
    body: t.Object({ name: t.String() }),
    headers: t.Object({ "x-api-key": t.String() }),
  },
});
```

## Schema Compilation — compileSchema()

`compileSchema()` at `compile.ts:25` returns a `Validator` function:

```ts
const validate = compileSchema(UserSchema);
const result: ValidatorResult = validate(input, "body");

if (result.success) {
  result.value; // typed as inferred type
} else {
  result.issues; // ValidationIssue[]
}
```

Shortcut:

```ts
import { compile } from "@ogerjs/core";
const validate = compile(UserSchema);
```

### ValidatorResult

```ts
interface ValidatorResult<T = unknown> {
  success: boolean;
  value?: T;
  issues?: Array<{
    type: string;       // "string" | "number" | "object" | "enum" | "custom" | ...
    property: string;   // "body/name" | "query/page" | "params/id"
    message: string;    // human-readable
    expected?: string;  // optional
  }>;
}
```

### Compiled Kind Behavior

| Kind | Validation Logic |
|------|-----------------|
| `string` | typeof check + `minLength`/`maxLength`/`pattern`/`format` |
| `number` | typeof + `NaN` check + `min`/`max` |
| `integer` | typeof + `Number.isInteger` |
| `boolean` | typeof |
| `literal` | strict equality |
| `enum` | `includes()` on literals array |
| `object` | typeof + properties recursively with required key check |
| `array` | `Array.isArray` + item recursion |
| `union` | first matching variant (try-all order) |
| `optional` | `undefined` passes, else inner validator |
| `nullable` | `null` passes, else inner validator |
| `record` | typeof + value validator on each entry |
| `file` | `File` or object with `name` property |
| `files` | `Array.every(f => f instanceof File)` |
| `custom` | delegates to `schema.validate` function |

## TypeScript Type Inference — `Static<T>`

```ts
import { t, type Static } from "@ogerjs/core";

const UserSchema = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ format: "email" }),
  age: t.Optional(t.Integer()),
});

type User = Static<typeof UserSchema>;
// { name: string; email: string; age?: number; }
```

For the full `TSchema` type, see `schema/types.ts:31`:

```ts
interface TSchema {
  readonly kind: SchemaKind;
  readonly options?: SchemaOptions;
  readonly properties?: Record<string, TSchema>;
  readonly items?: TSchema;
  readonly elements?: TSchema[];
  readonly values?: TSchema;
  readonly variants?: TSchema[];
  readonly literals?: readonly (string | number | boolean)[];
  readonly literal?: string | number | boolean;
  readonly required?: string[];
  readonly additionalProperties?: boolean;
  readonly validate?: Validator;
}
```

## Standard Schema v1 Adapter

Bridge any Standard Schema v1 implementation (e.g., Zod, Valibot):

```ts
import { fromStandardSchema } from "@ogerjs/core";

const zodSchema = z.object({ name: z.string() });
const ogerSchema = fromStandardSchema(zodSchema);

app.post("/users", handler, {
  body: ogerSchema,
});
```

`fromStandardSchema()` at `adapter.ts:31` wraps `~standard.validate` into an Oger `Validator`.

Also available:

- `adaptValidator(validate, label?)` — wrap any `Validator` as a `TSchema`
- `fromTypeBoxLike(schema, label?)` — minimal TypeBox-style object adapter

## RFC 7807 Error Responses

On validation failure, the pipeline returns a 422 response with `application/problem+json`:

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

Produced by `validationResponse()` at `error.ts:64`. See [ERROR_HANDLING.md](./ERROR_HANDLING.md).

## Body Parsing

The pipeline auto-parses request bodies before validation:

| Content-Type | Parsing |
|-------------|---------|
| `application/json` | `readJsonBody()` — uses `Request.json()` for payloads >8KB, `text()` + `JSON.parse` for smaller |
| `application/x-www-form-urlencoded` | `URLSearchParams` |
| `multipart/form-data` | `request.formData()` |
| Other | `undefined` (no body) |

Body parsing respects `bodyLimit` (default 1MB). Override via `new Oger({ bodyLimit: 5 * 1024 * 1024 })` or `listen(port, { bodyLimit })`.

See `context.ts:73` (`parseBody()`), `json.ts:34` (`readJsonBody()`).

## Performance

- Schemas compile once; `compileSchema()` caches nothing internally but the validator closure is created once per schema at pipeline compile time
- `isSimpleRoute()` at `pipeline.ts:29` skips all validation for routes without schemas
- Static literal routes (`() => "ok"`) bypass the pipeline entirely — compiled to a `Response` at build time
- Zero external runtime dependencies

## Cross-References

- [ROUTING.md](./ROUTING.md) — Route options, pipeline compilation, guards
- [CORE.md](./CORE.md) — Context, lifecycle hooks
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) — ValidationError, errorToResponse, Problem Details
- [OVERVIEW.md](./OVERVIEW.md) — Quickstart, package table
