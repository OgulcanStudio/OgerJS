# Cross-Runtime Compatibility Layer (`@ogerjs/compat`)

OgerJS is designed to let you write code **once** and run it seamlessly on both Bun and Node.js. While `@ogerjs/core` handles server routing compatibility (delegating to native `Bun.serve` on Bun, and Node's `http` / `https` on Node.js), the `@ogerjs/compat` package bridges other key enterprise APIs.

By leveraging native runtime modules with zero external dependencies, `@ogerjs/compat` ensures maximum performance and zero package bloat.

---

## Key Features

- **SQLite Database:** Transparently delegates to `bun:sqlite` on Bun and `node:sqlite` on Node.js.
- **Password Hashing:** delegates to `Bun.password` on Bun and implements secure `scrypt`/`pbkdf2` Modular Crypt Format (MCF) on Node.js.
- **Incremental Cryptographic Hasher:** Wraps `Bun.CryptoHasher` on Bun and `node:crypto` Hash/Hmac on Node.js.
- **One-Shot Crypto Utilities:** `randomBytes`, `randomUUID`, `hash`, `hmac`, and byte-level `timingSafeEqual` via `node:crypto` on both runtimes.
- **Sync Compression:** Wraps Bun's native sync compression on Bun and `node:zlib` on Node.js (gzip, deflate, zstd, brotli).
- **File I/O:** Unified `openFile` handle delegating to `Bun.file` on Bun and `node:fs` on Node.js.

---

## SQLite Database

OgerJS provides a unified `Database` class that allows you to write standard SQLite code once. It delegates to Bun's ultra-fast native `bun:sqlite` when running on Bun, and Node's stable native `node:sqlite` when running on Node.js (v22.5.0+).

### Usage

```ts
import { Database } from "@ogerjs/compat";

// Initialize database (automatically creates the file in-memory or on-disk)
const db = new Database(":memory:");

// Execute raw SQL statements
db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

// Prepare statements with positional parameters
const insertStmt = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
insertStmt.run("Alice", "alice@example.com");

// Prepare statements with named parameters (automatic prefix handling)
const insertNamedStmt = db.query("INSERT INTO users (name, email) VALUES ($name, $email)");
insertNamedStmt.run({ $name: "Bob", $email: "bob@example.com" });

// Query all matching rows as an array of objects
const users = db.query("SELECT * FROM users").all();
console.log(users); // [{ id: 1, name: 'Alice', ... }, { id: 2, name: 'Bob', ... }]

// Query a single matching row
const user = db.query("SELECT * FROM users WHERE id = ?").get(1);
console.log(user); // { id: 1, name: 'Alice', ... }

// Query rows as arrays of values (mapped to native stmt.setReturnArrays on Node)
const values = db.query("SELECT name, email FROM users").values();
console.log(values); // [["Alice", "alice@example.com"], ["Bob", "bob@example.com"]]

// Close the database connection
db.close();
```

### Transaction Support

OgerJS transaction wrapper handles native transactions on Bun, and standard `BEGIN` / `COMMIT` / `ROLLBACK` commands on Node.js, ensuring consistent state rollback on failures.

```ts
const insertItem = db.query("INSERT INTO items (title) VALUES (?)");

const runTx = db.transaction((title1, title2) => {
  insertItem.run(title1);
  insertItem.run(title2);
});

// Run successfully
runTx("Book", "Pen");

// Rolled back on errors
try {
  db.transaction(() => {
    insertItem.run("Laptop");
    throw new Error("Force fail");
  })();
} catch (e) {
  // Laptop is NOT inserted
}
```

---

## Password Hashing & Verification

Bun provides a highly optimized `Bun.password` API for password hashing using modern algorithms like `bcrypt` and `argon2`. Node.js does not have native support for these algorithms without third-party binary addons. 

OgerJS resolves this by providing a unified `password` utility that uses native `node:crypto` primitives (`scrypt` / `pbkdf2`) on Node.js, and delegates to native `Bun.password` on Bun.

### Usage

```ts
import { password } from "@ogerjs/compat";

// Hashing a password (defaults to bcrypt on Bun, scrypt on Node)
const hash = await password.hash("my-secret-password");

// Verifying a password (automatically parses format: bcrypt, argon2, scrypt, pbkdf2)
const isValid = await password.verify("my-secret-password", hash);
console.log(isValid); // true
```

### Specifying Hashing Algorithms

You can optionally request a specific algorithm:
```ts
// Force scrypt or pbkdf2 (guarantees cross-runtime database compatibility)
const scryptHash = await password.hash("password", { algorithm: "scrypt" });
const pbkdf2Hash = await password.hash("password", { algorithm: "pbkdf2" });

// Both hashes can be verified seamlessly on Node.js or Bun
assert(await password.verify("password", scryptHash));
assert(await password.verify("password", pbkdf2Hash));
```

> [!WARNING]
> If you hash passwords using `bcrypt` or `argon2id` on Bun (e.g. `Bun.password.hash`), verifying them under Node.js will throw a runtime error since Node.js has no native support for these algorithms. For 100% database compatibility across both runtimes, use `scrypt` or `pbkdf2` algorithms.

---

## Incremental Cryptographic Hasher

`@ogerjs/compat` provides a unified `CryptoHasher` class for incremental hashing, which delegates to `Bun.CryptoHasher` on Bun and Node's `node:crypto` `Hash` or `Hmac` on Node.js.

### Usage

```ts
import { CryptoHasher } from "@ogerjs/compat";

// 1. Simple incremental hashing
const hasher = new CryptoHasher("sha256");
hasher.update("hello");
hasher.update(" world");

// Digest as hex string
const hex = hasher.digest("hex");
console.log(hex); // "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"

// 2. Incremental HMAC hashing (using a secret key)
const hmac = new CryptoHasher("sha256", "my-secret-key");
hmac.update("hello world");
console.log(hmac.digest("hex")); // "90eb182d8396f16d4341d582047f45c0a97d73388c5377d9ced478a2212295ad"

// 3. Digest returning a raw Uint8Array (standardized across runtimes)
const binaryHasher = new CryptoHasher("sha256");
binaryHasher.update("hello");
const bin = binaryHasher.digest(); // returns Uint8Array
```

---

## One-Shot Crypto Utilities

`@ogerjs/compat` exports lightweight helpers for common cryptographic tasks. Both runtimes use `node:crypto`, which Bun implements natively.

### Usage

```ts
import { randomBytes, randomUUID, hash, hmac, timingSafeEqual } from "@ogerjs/compat";

const nonce = randomBytes(16);
const id = randomUUID();

const digest = hash("sha256", "hello world", "hex");
const mac = hmac("sha256", "secret-key", "payload", "hex");

const a = randomBytes(32);
const b = new Uint8Array(a);
timingSafeEqual(a, b); // true
```

For incremental hashing, use `CryptoHasher` (below).

---

## File I/O

`openFile` returns a `CompatFile` handle with a consistent async API across Bun and Node.js.

### Usage

```ts
import { openFile } from "@ogerjs/compat";

const file = openFile("./data/config.json");

if (await file.exists()) {
  const { size, lastModified } = await file.stat();
  const text = await file.text();
  const stream = file.stream();
}
```

On Bun, metadata reads delegate to `Bun.file`. On Node.js, they use `node:fs` promises and streams.

---

## Sync Compression

`@ogerjs/compat` exports a unified `compress` object providing synchronous compression and decompression routines.

### Usage

```ts
import { compress } from "@ogerjs/compat";

// Gzip Compression & Decompression
const original = "OgerJS compression compatibility verification";
const zipped = compress.gzip(original); // Returns Uint8Array
const unzipped = compress.gunzip(zipped); // Returns Uint8Array
console.log(new TextDecoder().decode(unzipped)); // "OgerJS compression compatibility verification"

// Deflate Compression & Decompression
const compressed = compress.deflate(original);
const decompressed = compress.inflate(compressed);
console.log(new TextDecoder().decode(decompressed)); // "OgerJS compression compatibility verification"

// Zstd (Bun native sync API; node:zlib on Node.js 22+)
const zstd = compress.zstd(original);
const plain = compress.unzstd(zstd);

// Brotli (node:zlib on both runtimes)
const brotli = compress.brotli(original);
const restored = compress.unbrotli(brotli);
```

---

## Bun Native Package Shims & Loader Registration

To allow writing an OgerJS project that runs in both Bun and Node.js without any code modifications, `@ogerjs/compat` provides an ESM import registration hook (`@ogerjs/compat/register`) and shims for all Bun-specific packages:

### Global `Bun` Namespace
When registered in Node.js, the global `Bun` object is automatically defined and shimmed, supporting:
- **`Bun.escapeHTML(string)`**: High-performance HTML escaping.
- **`Bun.sleep(ms)` / `Bun.sleepSync(ms)`**: Synchronous and asynchronous sleep helpers (utilizing `Atomics.wait` on shared buffers for blocking synchronously on Node.js).
- **`Bun.concat(arrays)`**: High-performance TypedArray merging.
- **`Bun.deepEquals(a, b)`**: Recursive object equality matching (supporting Maps, Sets, TypedArrays, Dates, RegExps, etc.).
- **`Bun.which(command)`**: Cross-platform path resolution for binary commands.
- **`Bun.nanoseconds()`**: High-resolution nanoseconds elapsed since startup.
- **`Bun.hash`**: Fast non-cryptographic hashes (`adler32`, `crc32`, `murmur32`, `wyhash`, `murmur64`, `cityHash32`, `cityHash64`).

### Native Bun Modules
If your code imports Bun-native modules directly, they are intercepted and resolved automatically in Node.js:
- **`bun`**: Resolves to the `Bun` namespace shim.
- **`bun:sqlite`**: Resolves to Node's native `DatabaseSync` wrapper.
- **`bun:jsc`**: Maps to V8 serialization and heap statistic primitives.
- **`bun:ffi`**: Provides platform suffixes and type constants, allowing library loading (`dlopen`) to parse/load without errors, throwing only if an FFI function is actually executed under Node.js.
- **`bun:test`**: Maps test suites directly onto Node's native `node:test` runner, incorporating a complete Jest-compatible `expect()` matcher wrapper.

### `import.meta.main` Injection
The custom registration loader dynamically intercepts ES modules to define `import.meta.main` as `true` for the main entry point module, matching Bun's startup behavior perfectly.

### Usage in Node.js
To run your project under Node.js with all shims active, use Node's import flag:
```bash
node --import @ogerjs/compat/register app.js
```

---

## Coverage Gaps

The compat layer focuses on APIs with **different entry points** between Bun and Node.js. The following are intentionally out of scope or handled elsewhere:

| Area | Status |
|------|--------|
| HTTP server / routing | `@ogerjs/core` (`Bun.serve` vs `node:http`) |
| `fetch` / `Request` / `Response` | Web standard globals on Bun; on Node.js, `@ogerjs/core` uses high-performance duck-typed facades (`OgerNodeRequest` and `OgerNodeHeaders`) to bypass slow native constructors. |
| `WebSocket` | Web standard; core `listen({ websocket })` on Bun |
| `process.env` / `Bun.env` | `@ogerjs/core` `loadEnv` |
| `node:fs`, `node:path`, `node:stream` | Import directly; identical on both runtimes |
| `Buffer` | Global on both runtimes |
| `bcrypt` / `argon2` password hashes | Bun-only; use `scrypt` or `pbkdf2` for cross-runtime DB storage |
| Async compression streams | Not yet unified (sync helpers only) |
| `Bun.redis`, `Bun.sql` | Bun-only; no Node native equivalent |

