import test from "node:test";
import assert from "node:assert/strict";
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
		db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

		// Positional parameters
		const insert = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
		const res1 = insert.run("Alice", "alice@example.com");
		assert.equal(res1.changes, 1);
		assert.equal(res1.lastInsertRowid, 1);

		// Named parameters
		const insertNamed = db.query("INSERT INTO users (name, email) VALUES ($name, $email)");
		const res2 = insertNamed.run({ $name: "Bob", $email: "bob@example.com" });
		assert.equal(res2.changes, 1);
		assert.equal(res2.lastInsertRowid, 2);

		// Query all
		const selectAll = db.query("SELECT * FROM users ORDER BY id ASC");
		const rows = selectAll.all();
		assert.equal(rows.length, 2);
		assert.equal(rows[0].name, "Alice");
		assert.equal(rows[1].name, "Bob");

		// Query get
		const selectOne = db.query("SELECT * FROM users WHERE id = ?");
		const row = selectOne.get(2);
		assert.equal(row.name, "Bob");

		// Query values
		const selectValues = db.query("SELECT name, email FROM users ORDER BY id ASC");
		const values = selectValues.values();
		assert.deepEqual(values, [
			["Alice", "alice@example.com"],
			["Bob", "bob@example.com"],
		]);

		// Transactions
		const insertItem = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
		const tx = db.transaction((fail) => {
			insertItem.run("Charlie", "charlie@example.com");
			if (fail) throw new Error("Rollback");
		});

		// Successful transaction
		tx(false);
		assert.equal(db.query("SELECT COUNT(*) as count FROM users").get().count, 3);

		// Failing transaction
		assert.throws(() => tx(true), /Rollback/);
		assert.equal(db.query("SELECT COUNT(*) as count FROM users").get().count, 3); // unchanged

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
});
