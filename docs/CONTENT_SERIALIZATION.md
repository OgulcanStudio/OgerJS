# Content Serialization

OgerJS provides first-class support for content negotiation, streaming, compression, cookies, file uploads, and multiple output formats — all as opt-in plugins.

## Content Negotiation

`@ogerjs/negotiate` auto-selects output format based on `Accept` header:

```ts
import { negotiate } from "@ogerjs/negotiate";

app.use(negotiate({ defaultFormat: "json" }));
// Accept: application/json → JSON
// Accept: text/html → HTML
// Accept: application/xml → XML
// Accept: text/csv → CSV
// Accept: text/plain → Text
```

Supports `json`, `html`, `xml`, `csv`, `text`, and `msgpack` formats.

## JSON

`@ogerjs/json` provides eager JSON body parsing and typed response helpers:

```ts
import { json, jsonResponse } from "@ogerjs/json";

app.use(json({ bodyLimit: 1024 * 1024 })); // Eager parse, 1 MiB limit

// Typed JSON response with auto content-type
app.get("/data", () => jsonResponse({ items: [] }));
```

Re-exports core helpers: `isJsonContentType()`, `readJsonBody()`, `stringifyJson()`.

## HTML

`@ogerjs/html` provides SSR helpers (not a plugin — import functions directly):

```ts
import { html, htmlLayout, dashboardLayout, tableFromRows, metricCard } from "@ogerjs/html";

app.get("/", () => html("<h1>Hello</h1>"));
app.get("/dashboard", () => dashboardLayout("Admin", [
  { title: "Users", content: metricCard("Total", "42") },
]));
app.get("/table", () => tableFromRows([{ id: "1", name: "Alice" }]));
```

## HTMX

`@ogerjs/htmx` provides HTMX response helpers:

```ts
import { htmxPartial, htmxRedirect, htmxTrigger, htmxValidationErrors } from "@ogerjs/htmx";

app.get("/partial", () => htmxPartial("<div>Updated</div>", { swap: "outerHTML" }));
app.post("/action", () => htmxRedirect("/new-url"));
app.get("/events", () => htmxTrigger({ name: "refresh" }));

// Validation errors with HX-Trigger
app.post("/submit", () => {
  const issues = [{ property: "email", message: "Invalid email" }];
  return htmxValidationErrors(issues);
});
```

## Streaming

`@ogerjs/stream` provides streaming response builders:

```ts
import { streamFile, streamJsonLines, streamCsv, streamLines } from "@ogerjs/stream";

// Stream a file
app.get("/download", () => streamFile(Bun.file("./data.csv"), { contentType: "text/csv" }));

// NDJSON stream
app.get("/events.ndjson", () => streamJsonLines(asyncEvents()));

// CSV stream
app.get("/data.csv", () => streamCsv(async function*() { yield ["id", "name"]; }(), { header: ["ID", "Name"] }));

// Plain text lines
app.get("/logs", () => streamLines(async function*() { yield "line1"; }()));
```

## Compression

`@ogerjs/compress` adds gzip compression with per-route rules:

```ts
import { compress } from "@ogerjs/compress";

app.use(compress({
  threshold: 1024, // min bytes to compress
  encoding: "gzip",
  pathRules: [{ prefix: "/api", threshold: 512 }, { prefix: "/events", enabled: false }],
}));
// Respects accept-encoding, skips images/video/audio, appends Vary: Accept-Encoding
```

## ETags

`@ogerjs/etag` adds automatic ETag-based caching:

```ts
import { etag } from "@ogerjs/etag";

app.use(etag({
  weak: false, // strong ETags by default
  pathRules: [{ prefix: "/api", weak: true }],
}));
// Returns 304 Not Modified when If-None-Match matches
```

## Cookies

`@ogerjs/cookie` provides signed and encrypted cookies:

```ts
import { cookie, createCookieDescriptor } from "@ogerjs/cookie";

app.use(cookie({ signed: true, encrypted: true, secret: process.env.COOKIE_SECRET! }));

// Reading cookies from ctx.cookie
app.get("/me", ({ cookie }) => cookie.session.value);

// Setting cookies via ctx.set.cookie
app.post("/login", (ctx) => {
  ctx.set.cookie = { session: createCookieDescriptor("session", "abc123", { maxAge: 3600 }) };
  return { ok: true };
});

// Standalone helpers
import { signCookieValue, unsignCookieValue, encryptCookieValue, decryptCookieValue } from "@ogerjs/cookie";
```

## File Uploads

`@ogerjs/upload` provides multipart form parsing:

```ts
import { parseMultipartUpload, UploadError } from "@ogerjs/upload";

app.post("/upload", async ({ request }) => {
  try {
    const { files, fields } = await parseMultipartUpload(request, {
      maxFileSize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 8,
      allowedMimeTypes: ["image/"],
      virusScan: async (file) => true, // custom scanner hook
    });
    return { files: files.map(f => ({ name: f.name, hash: f.hash, size: f.size })), fields };
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
});
```
