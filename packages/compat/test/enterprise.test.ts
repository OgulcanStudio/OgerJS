import "../src/register";
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { Database } from "../src/sqlite";
import { Bun } from "../src/bun-shim";
import * as jsc from "../src/jsc";

describe("OgerJS Compat Enterprise Edge Cases", () => {
	const tempDir = path.join(import.meta.dir, "temp");

	beforeAll(() => {
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir);
		}
	});

	afterAll(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {}
	});

	test("Bun.semver - order and satisfies", () => {
		const semver = Bun.semver;
		expect(semver).toBeDefined();

		// order
		expect(semver.order("1.2.3", "1.2.4")).toBe(-1);
		expect(semver.order("2.0.0", "1.0.0")).toBe(1);
		expect(semver.order("1.0.0", "1.0.0")).toBe(0);
		expect(semver.order("1.0.0-alpha", "1.0.0")).toBe(-1);

		// satisfies
		expect(semver.satisfies("1.2.3", "^1.2.0")).toBe(true);
		expect(semver.satisfies("2.0.0", "^1.2.0")).toBe(false);
		expect(semver.satisfies("1.2.5", "~1.2.0")).toBe(true);
		expect(semver.satisfies("1.3.0", "~1.2.0")).toBe(false);
		expect(semver.satisfies("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
		expect(semver.satisfies("2.5.0", ">=1.0.0 <2.0.0")).toBe(false);
	});

	test("Bun.randomUUIDv7 - format check", () => {
		const uuid = Bun.randomUUIDv7();
		expect(uuid).toBeDefined();
		expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	test("Bun.gc - existence check", () => {
		expect(typeof Bun.gc).toBe("function");
		expect(() => Bun.gc()).not.toThrow();
	});

	test("Bun.file().slice() - lazy file slicing", async () => {
		const filePath = path.join(tempDir, "slice-test.txt");
		fs.writeFileSync(filePath, "Hello Lazy Slicing World!");

		const bunFile = Bun.file(filePath);
		expect(bunFile).toBeDefined();
		expect(await bunFile.exists()).toBe(true);

		// Slice middle part: "Lazy Slicing"
		const slice = bunFile.slice(6, 18);
		expect(slice.size).toBe(12);
		expect(await slice.text()).toBe("Lazy Slicing");

		// ArrayBuffer check
		const ab = await slice.arrayBuffer();
		const view = new Uint8Array(ab);
		expect(new TextDecoder().decode(view)).toBe("Lazy Slicing");

		// stream check
		const stream = slice.stream();
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
		let offset = 0;
		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}
		expect(new TextDecoder().decode(combined)).toBe("Lazy Slicing");
	});

	test("Bun.write() - support ReadableStream input", async () => {
		const filePath = path.join(tempDir, "write-stream-test.txt");
		
		const chunks = ["Hello", " ", "From", " ", "A", " ", "ReadableStream!"];
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(new TextEncoder().encode(chunk));
				}
				controller.close();
			}
		});

		const bytesWritten = await Bun.write(filePath, stream);
		expect(bytesWritten).toBe(28);

		const content = fs.readFileSync(filePath, "utf8");
		expect(content).toBe("Hello From A ReadableStream!");
	});

	test("Bun.spawn() - exited promise and stream helper methods", async () => {
		// We spawn node to print a message
		const isWin = process.platform === "win32";
		const command = ["node", "-e", "console.log('Spawn Test Success'); process.exit(0);"];

		const proc = Bun.spawn(command, { stdout: "pipe" });
		expect(proc.pid).toBeGreaterThan(0);
		expect(proc.stdout).toBeDefined();

		// test text() helper on stdout stream
		const text = await proc.stdout.text();
		expect(text.trim()).toBe("Spawn Test Success");

		// test exited promise
		const code = await proc.exited;
		expect(code).toBe(0);
	});

	test("bun:jsc - writeHeapSnapshot", () => {
		const snapshotPath = path.join(tempDir, "heap-snapshot.heapsnapshot");
		
		expect(() => jsc.writeHeapSnapshot(snapshotPath)).not.toThrow();
		expect(fs.existsSync(snapshotPath)).toBe(true);
		expect(fs.statSync(snapshotPath).size).toBeGreaterThan(0);
	});

	test("Database.prototype.query().as(Class) mapping", () => {
		class User {
			id!: number;
			name!: string;
			email!: string;

			get uppercaseName() {
				return this.name.toUpperCase();
			}
		}

		// Run in simulated node compat mode
		(globalThis as any).FORCE_NODE_COMPAT = true;
		try {
			const db = new Database(":memory:");
			db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");
			db.run("INSERT INTO users (name, email) VALUES (?, ?)", "Alice", "alice@example.com");

			const query = db.query("SELECT * FROM users").as(User);
			
			// test all()
			const users = query.all();
			expect(users.length).toBe(1);
			expect(users[0]).toBeInstanceOf(User);
			expect(users[0].name).toBe("Alice");
			expect(users[0].uppercaseName).toBe("ALICE");

			// test get()
			const user = query.get();
			expect(user).toBeDefined();
			expect(user).toBeInstanceOf(User);
			expect(user.name).toBe("Alice");
			expect(user.uppercaseName).toBe("ALICE");

			db.close();
		} finally {
			(globalThis as any).FORCE_NODE_COMPAT = false;
		}
	});

	test("Bun extended APIs - utils, glob, cookie, toml, streams", async () => {
		expect(Bun.stringWidth("hello")).toBe(5);
		expect(Bun.stringWidth("你好")).toBe(4);

		const samplePath = path.join(tempDir, "url-test.txt");
		const sampleUrl = Bun.pathToFileURL(samplePath);
		expect(Bun.fileURLToPath(sampleUrl)).toBe(path.resolve(samplePath));
		expect(sampleUrl.protocol).toBe("file:");

		expect(typeof Bun.resolveSync("node:fs")).toBe("string");
		expect(Bun.deepMatch({ a: 1, b: [2] }, { a: 1 })).toBe(true);
		expect(Bun.deepMatch({ a: 1 }, { a: 2 })).toBe(false);

		const sink = new Bun.ArrayBufferSink();
		sink.write("hello");
		sink.write(" world");
		const buf = sink.end();
		expect(new TextDecoder().decode(buf)).toBe("hello world");

		const stream = new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode('{"ok":true}'));
				c.close();
			},
		});
		expect(await Bun.readableStreamToText(stream)).toBe('{"ok":true}');

		const glob = new Bun.Glob("*.txt");
		expect(glob.match("file.txt")).toBe(true);
		expect(glob.match("file.js")).toBe(false);

		const cookie = new Bun.Cookie("session", "abc", { path: "/", httpOnly: true });
		expect(cookie.toString()).toContain("session=abc");
		expect(cookie.toString()).toContain("HttpOnly");

		const map = new Bun.CookieMap("a=1; b=2");
		expect(map.get("a")).toBe("1");
		expect(map.get("b")).toBe("2");

		const parsed = Bun.TOML.parse('[app]\nname = "oger"\nport = 3000');
		expect((parsed.app as any).name).toBe("oger");
		expect((parsed.app as any).port).toBe(3000);

		expect(typeof Bun.sha("sha256", "hello", "hex")).toBe("string");
		expect(typeof Bun.main).toBe("boolean");

		expect(typeof Bun.CSRF.generate).toBe("function");
		expect(typeof Bun.CSRF.verify).toBe("function");
		const csrf = Bun.CSRF.generate("bench");
		expect(Bun.CSRF.verify(csrf)).toBe(true);
		expect(Bun.CSRF.verify("bad-token")).toBe(false);

		expect(Bun.color.parse("red")).toBe("#ff0000");
		expect(Bun.color.parse("rgb(255, 0, 0)")).toBe("#ff0000");
	});

	test("node:sqlite shim registration & behavior in Bun", () => {
		// Require node:sqlite (which resolves to our shim because of the register plugin CJS patch)
		const { createRequire } = require("node:module");
		const requireShim = createRequire(import.meta.url);
		const { DatabaseSync } = requireShim("node:sqlite") as any;
		expect(DatabaseSync).toBeDefined();

		const db = new DatabaseSync(":memory:");
		db.exec("CREATE TABLE tests (id INTEGER PRIMARY KEY, msg TEXT)");
		
		const stmt = db.prepare("INSERT INTO tests (msg) VALUES (?)");
		stmt.all("Hello Node SQLite Shim");

		const select = db.prepare("SELECT * FROM tests");
		const rows = select.all();
		expect(rows.length).toBe(1);
		expect(rows[0].msg).toBe("Hello Node SQLite Shim");

		// iterate test
		const iterator = select.iterate();
		const item = iterator.next();
		expect(item.done).toBe(false);
		expect(item.value.msg).toBe("Hello Node SQLite Shim");
		expect(iterator.next().done).toBe(true);

		db.close();
	});
});
