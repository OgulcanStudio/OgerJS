// Register bun: protocol loader before any compat imports (Node.js only).
import "../dist/register.js";

import test from "node:test";
import assert from "node:assert/strict";
import v8 from "node:v8";
import {
	compress,
	CryptoHasher,
	hash,
	hmac,
	randomBytes,
	randomUUID,
	timingSafeEqual,
	openFile,
	password,
	Database,
} from "../dist/index.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("Node.js compatibility verification", async (t) => {
	await t.test("SQLite Database & Statement", () => {
		const db = new Database(":memory:");
		assert.equal(db.filename, ":memory:");
		assert.equal(db.inTransaction, false);

		db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

		// Positional parameters
		const insert = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
		assert.equal(insert.paramsCount, 2);
		assert.equal(insert.sourceSQL, "INSERT INTO users (name, email) VALUES (?, ?)");

		const res1 = insert.run("Alice", "alice@example.com");
		assert.equal(res1.changes, 1);
		assert.equal(res1.lastInsertRowid, 1);

		// test database run method directly
		const resDirect = db.run("INSERT INTO users (name, email) VALUES (?, ?)", "David", "david@example.com");
		assert.equal(resDirect.changes, 1);
		assert.equal(resDirect.lastInsertRowid, 2);

		// test prepare method on Database
		const insertPrep = db.prepare("INSERT INTO users (name, email) VALUES ($name, $email)");
		assert.equal(insertPrep.paramsCount, 2);
		const res2 = insertPrep.run({ $name: "Bob", $email: "bob@example.com" });
		assert.equal(res2.changes, 1);
		assert.equal(res2.lastInsertRowid, 3);

		// Query all
		const selectAll = db.query("SELECT * FROM users ORDER BY id ASC");
		assert.equal(selectAll.paramsCount, 0);
		// columnNames is empty initially until we execute it
		assert.deepEqual(selectAll.columnNames, []);
		const rows = selectAll.all();
		assert.equal(rows.length, 3);
		assert.equal(rows[0].name, "Alice");
		assert.equal(rows[1].name, "David");
		assert.equal(rows[2].name, "Bob");
		// Now it should be populated/cached
		assert.deepEqual(selectAll.columnNames, ["id", "name", "email"]);

		// Query get
		const selectOne = db.query("SELECT * FROM users WHERE id = ?");
		assert.equal(selectOne.paramsCount, 1);
		const row = selectOne.get(3);
		assert.equal(row.name, "Bob");
		assert.deepEqual(selectOne.columnNames, ["id", "name", "email"]);

		// Query values
		const selectValues = db.query("SELECT name, email FROM users ORDER BY id ASC");
		const values = selectValues.values();
		assert.deepEqual(values, [
			["Alice", "alice@example.com"],
			["David", "david@example.com"],
			["Bob", "bob@example.com"],
		]);

		// Transactions
		const insertItem = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
		const tx = db.transaction((fail) => {
			assert.equal(db.inTransaction, true);
			insertItem.run("Charlie", "charlie@example.com");
			if (fail) throw new Error("Rollback");
		});

		// Successful transaction
		assert.equal(db.inTransaction, false);
		tx(false);
		assert.equal(db.inTransaction, false);
		assert.equal(db.query("SELECT COUNT(*) as count FROM users").get().count, 4);

		// Failing transaction
		assert.throws(() => tx(true), /Rollback/);
		assert.equal(db.inTransaction, false);
		assert.equal(db.query("SELECT COUNT(*) as count FROM users").get().count, 4); // unchanged

		db.close();
	});

	await t.test("Password hashing & verification", async () => {
		const pwd = "my-node-password-123";

		// Default (scrypt on Node.js)
		const hash = await password.hash(pwd);
		assert.ok(hash.startsWith("$scrypt$"));
		assert.ok(await password.verify(pwd, hash));
		assert.ok(!(await password.verify("wrong-password", hash)));

		// Explicit pbkdf2
		const pbkdf2Hash = await password.hash(pwd, { algorithm: "pbkdf2" });
		assert.ok(pbkdf2Hash.startsWith("$pbkdf2$"));
		assert.ok(await password.verify(pwd, pbkdf2Hash));
		assert.ok(!(await password.verify("wrong-password", pbkdf2Hash)));

		// Verify bcrypt fails on Node.js
		const bcryptHash = "$2a$12$N9qo8uLOqpGC123456789ae65432101234567890abcdefghijkl";
		await assert.rejects(
			() => password.verify("pwd", bcryptHash),
			/only supported natively on Bun runtime/,
		);
	});

	await t.test("CryptoHasher", () => {
		// SHA-256 without key
		const hasher = new CryptoHasher("sha256");
		hasher.update("hello");
		hasher.update(" world");
		assert.equal(
			hasher.digest("hex"),
			"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
		);

		// SHA-256 with key (HMAC)
		const hasherHmac = new CryptoHasher("sha256", "my-secret-key");
		hasherHmac.update("hello world");
		assert.equal(
			hasherHmac.digest("hex"),
			"90eb182d8396f16d4341d582047f45c0a97d73388c5377d9ced478a2212295ad",
		);

		// Binary digest
		const hasherBinary = new CryptoHasher("sha256");
		hasherBinary.update("hello world");
		const bin = hasherBinary.digest();
		assert.ok(bin instanceof Uint8Array);
		assert.equal(bin.length, 32);
	});

	await t.test("Compression", () => {
		const original = "OgerJS node compression verification";

		// Gzip
		const zipped = compress.gzip(original);
		assert.ok(zipped instanceof Uint8Array);
		const unzipped = compress.gunzip(zipped);
		assert.equal(new TextDecoder().decode(unzipped), original);

		// Deflate
		const compressed = compress.deflate(original);
		assert.ok(compressed instanceof Uint8Array);
		const decompressed = compress.inflate(compressed);
		assert.equal(new TextDecoder().decode(decompressed), original);

		// Zstd
		const zstd = compress.zstd(original);
		assert.ok(zstd instanceof Uint8Array);
		assert.equal(new TextDecoder().decode(compress.unzstd(zstd)), original);

		// Brotli
		const brotli = compress.brotli(original);
		assert.ok(brotli instanceof Uint8Array);
		assert.equal(new TextDecoder().decode(compress.unbrotli(brotli)), original);
	});

	await t.test("Crypto utilities", () => {
		const bytes = randomBytes(32);
		assert.ok(bytes instanceof Uint8Array);
		assert.equal(bytes.length, 32);

		const id = randomUUID();
		assert.match(
			id,
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);

		assert.equal(
			hash("sha256", "hello world", "hex"),
			"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
		);
		assert.equal(
			hmac("sha256", "my-secret-key", "hello world", "hex"),
			"90eb182d8396f16d4341d582047f45c0a97d73388c5377d9ced478a2212295ad",
		);

		const a = randomBytes(16);
		const b = new Uint8Array(a);
		assert.ok(timingSafeEqual(a, b));
		assert.ok(!timingSafeEqual(a, randomBytes(16)));
	});

	await t.test("File API", async () => {
		const dir = await mkdtemp(join(tmpdir(), "oger-compat-node-file-"));
		const filePath = join(dir, "sample.txt");
		const content = "OgerJS node file API verification";
		await writeFile(filePath, content, "utf8");

		try {
			const file = openFile(filePath);
			assert.equal(file.path, filePath);
			assert.equal(await file.exists(), true);
			assert.equal(await openFile(join(dir, "missing.txt")).exists(), false);

			const stat = await file.stat();
			assert.equal(stat.size, Buffer.byteLength(content, "utf8"));
			assert.ok(stat.lastModified > 0);
			assert.equal(await file.text(), content);

			const buf = await file.arrayBuffer();
			assert.equal(new TextDecoder().decode(buf), content);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	await t.test("Global Bun namespace & native package shims", async () => {
		try {
			// Verify global Bun exists
			assert.ok(typeof Bun !== "undefined");
			assert.equal(Bun.version, "1.3.14-compat");
			assert.ok(Bun.env === process.env);

			// Bun.file & Bun.write
			const dir = await mkdtemp(join(tmpdir(), "oger-compat-global-file-"));
			const filePath = join(dir, "global-sample.txt");
			const content = "Global Bun file writing test";
			await Bun.write(filePath, content);
			
			const file = Bun.file(filePath);
			assert.equal(await file.exists(), true);
			assert.equal(file.size, Buffer.byteLength(content));
			assert.equal(await file.text(), content);
			assert.equal(file.name, filePath);
			assert.ok(file.lastModified > 0);

			// File writer / FileSink test
			const writePath = join(dir, "sink-sample.txt");
			const sinkFile = Bun.file(writePath);
			const writer = sinkFile.writer();
			writer.write("Hello ");
			writer.write("Sink!");
			await writer.end();
			assert.equal(await sinkFile.text(), "Hello Sink!");

			// Bun.serve
			const server = Bun.serve({
				port: 0,
				fetch(req) {
					return new Response("Hello from Bun.serve shim");
				}
			});
			assert.ok(server.port > 0);
			const res = await fetch(`http://127.0.0.1:${server.port}/`);
			const text = await res.text();
			assert.equal(text, "Hello from Bun.serve shim");
			server.stop();

			// Bun.spawn & Bun.spawnSync
			const syncRes = Bun.spawnSync(["node", "--version"]);
			assert.ok(syncRes.success);
			assert.ok(syncRes.stdout.toString().startsWith("v"));

			const proc = Bun.spawn(["node", "--version"]);
			assert.ok(proc.pid > 0);
			const stdoutText = await new Response(proc.stdout).text();
			assert.ok(stdoutText.startsWith("v"));

			// Bun.dns
			assert.ok(typeof Bun.dns.lookup === "function");

			// Bun.peek
			const p = Promise.resolve("done");
			assert.equal(Bun.peek(p), p);

			// bun:jsc
			const jsc = await import("bun:jsc");
			assert.equal(typeof jsc.heapSize(), "number");
			const serialized = v8.serialize("hello");
			assert.equal(jsc.deserialize(serialized), "hello");

			// Bun.escapeHTML
			assert.equal(Bun.escapeHTML("<script>&hello'\"</script>"), "&lt;script&gt;&amp;hello&#x27;&quot;&lt;/script&gt;");

			// Bun.sleep & Bun.sleepSync
			const tStart = Date.now();
			Bun.sleepSync(10);
			assert.ok(Date.now() - tStart >= 10);
			await Bun.sleep(10);
			assert.ok(Date.now() - tStart >= 20);

			// Bun.concat
			const u1 = new Uint8Array([1, 2]);
			const u2 = new Uint8Array([3, 4]);
			assert.deepEqual(Bun.concat([u1, u2]), new Uint8Array([1, 2, 3, 4]));

			// Bun.deepEquals
			assert.ok(Bun.deepEquals({ a: [1, 2], b: new Set([3]) }, { a: [1, 2], b: new Set([3]) }));
			assert.ok(!Bun.deepEquals({ a: 1 }, { a: 2 }));

			// Bun.which
			const nodePath = Bun.which("node");
			assert.ok(nodePath !== null);

			// Bun.toBuffer
			const arrBuf = new Uint8Array([65, 66]).buffer;
			const bufferVal = Bun.toBuffer(arrBuf);
			assert.ok(bufferVal instanceof Buffer);
			assert.equal(bufferVal.toString(), "AB");

			// Bun.nanoseconds
			assert.equal(typeof Bun.nanoseconds(), "number");

			// Bun.randomUUIDv7 & Bun.gc
			const uuidv7 = Bun.randomUUIDv7();
			assert.match(uuidv7, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
			assert.equal(typeof Bun.gc, "function");
			assert.doesNotThrow(() => Bun.gc());

			// Bun.hash APIs
			assert.equal(typeof Bun.hash("test"), "number");
			assert.equal(Bun.hash.adler32("hello"), 103547413);
			assert.equal(Bun.hash.crc32("hello"), 907060870);
			assert.equal(typeof Bun.hash.murmur32("hello"), "number");

			assert.equal(typeof Bun.hash.wyhash("hello"), "bigint");
			assert.equal(typeof Bun.hash.murmur64("hello"), "bigint");
			assert.equal(typeof Bun.hash.cityHash32("hello"), "number");
			assert.equal(typeof Bun.hash.cityHash64("hello"), "bigint");

			// bun:ffi
			const ffi = await import("bun:ffi");
			assert.equal(typeof ffi.suffix, "string");
			assert.equal(typeof ffi.FFIType, "object");
			const ffiLib = ffi.dlopen("dummy", {
				testFunc: {
					args: [ffi.FFIType.int32],
					returns: ffi.FFIType.void
				}
			});
			assert.throws(() => ffiLib.symbols.testFunc(123), /FFI function "testFunc" from library "dummy" cannot be executed/);

			// bun:test
			const bunTest = await import("bun:test");
			assert.equal(typeof bunTest.describe, "function");
			assert.equal(typeof bunTest.expect, "function");
			assert.equal(typeof bunTest.before, "function");
			assert.equal(typeof bunTest.after, "function");

			bunTest.expect(1).toBe(1);
			bunTest.expect({ a: 1 }).toEqual({ a: 1 });
			bunTest.expect("hello").toContain("ell");
			bunTest.expect(() => { throw new Error("fail") }).toThrow(/fail/);

			bunTest.expect(1).toBeDefined();
			bunTest.expect(undefined).not.toBeDefined();
			bunTest.expect(2.001).toBeCloseTo(2.0, 2);
			bunTest.expect({ a: 1 }).toStrictEqual({ a: 1 });
			bunTest.expect(() => { throw new Error("error") }).toThrowError(/error/);

			// test asymmetric matchers
			bunTest.expect({ name: "Alice", age: 30 }).toEqual({
				name: bunTest.expect.any(String),
				age: bunTest.expect.anything(),
			});
			bunTest.expect({ name: "Alice", age: 30 }).toEqual(
				bunTest.expect.objectContaining({ name: "Alice" })
			);
			bunTest.expect("hello world").toEqual(bunTest.expect.stringContaining("hello"));
			bunTest.expect("hello world").toEqual(bunTest.expect.stringMatching(/world/));
			bunTest.expect([1, 2, 3]).toEqual(bunTest.expect.arrayContaining([1, 3]));

			// test mocks
			const myMock = bunTest.mock.fn((x) => x + 1);
			myMock(10);
			myMock(20);
			bunTest.expect(myMock).toHaveBeenCalled();
			bunTest.expect(myMock).toBeCalled();
			bunTest.expect(myMock).toHaveBeenCalledTimes(2);
			bunTest.expect(myMock).toHaveBeenCalledWith(10);
			bunTest.expect(myMock).toHaveBeenCalledWith(20);

			// Extended Bun utility APIs
			assert.equal(Bun.stringWidth("hello"), 5);
			assert.equal(Bun.stringWidth("你好"), 4);
			const samplePath = join(dir, "url-test.txt");
			const sampleUrl = Bun.pathToFileURL(samplePath);
			assert.equal(Bun.fileURLToPath(sampleUrl), join(dir, "url-test.txt"));
			assert.equal(sampleUrl.protocol, "file:");
			assert.equal(typeof Bun.resolveSync("node:fs"), "string");
			assert.ok(Bun.deepMatch({ a: 1, b: [2] }, { a: 1 }));
			assert.ok(!Bun.deepMatch({ a: 1 }, { a: 2 }));

			const sink = new Bun.ArrayBufferSink();
			sink.write("hello");
			sink.write(" world");
			assert.equal(new TextDecoder().decode(sink.end()), "hello world");

			const glob = new Bun.Glob("*.txt");
			assert.ok(glob.match("file.txt"));
			assert.ok(!glob.match("file.js"));

			const cookie = new Bun.Cookie("session", "abc", { path: "/", httpOnly: true });
			assert.ok(cookie.toString().includes("session=abc"));
			const cookieMap = new Bun.CookieMap("a=1; b=2");
			assert.equal(cookieMap.get("a"), "1");

			const toml = Bun.TOML.parse('[app]\nname = "oger"\nport = 3000');
			assert.equal(toml.app.name, "oger");
			assert.equal(toml.app.port, 3000);

			assert.equal(typeof Bun.sha("sha256", "hello", "hex"), "string");
			assert.equal(typeof Bun.main, "boolean");

			assert.equal(typeof Bun.CSRF.generate, "function");
			const csrf = Bun.CSRF.generate("node");
			assert.ok(Bun.CSRF.verify(csrf));
			assert.equal(Bun.color.parse("red"), "#ff0000");

			// import.meta.main (should be set via loader.ts load hook)
			assert.equal(import.meta.main, true);

			await rm(dir, { recursive: true, force: true });
		} catch (err) {
			console.error("GLOBAL TEST SHIM ERROR:", err);
			throw err;
		}
	});
});


