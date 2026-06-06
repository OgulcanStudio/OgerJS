import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Database } from "../src/sqlite";

describe("sqlite compatibility layer", () => {
	const runTests = () => {
		test("create table, insert data, and query", () => {
			const db = new Database(":memory:");
			db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");

			// Positional parameter insert
			const insert = db.query("INSERT INTO users (name, email) VALUES (?, ?)");
			const res1 = insert.run("Alice", "alice@example.com");
			expect(res1.changes).toBe(1);
			expect(res1.lastInsertRowid).toBe(1);

			// Named parameter insert
			const insertNamed = db.query("INSERT INTO users (name, email) VALUES ($name, $email)");
			const res2 = insertNamed.run({ $name: "Bob", $email: "bob@example.com" });
			expect(res2.changes).toBe(1);
			expect(res2.lastInsertRowid).toBe(2);

			// Query all
			const selectAll = db.query("SELECT * FROM users ORDER BY id ASC");
			const rows = selectAll.all();
			expect(rows.length).toBe(2);
			expect(rows[0].name).toBe("Alice");
			expect(rows[1].name).toBe("Bob");

			// Query get (single row)
			const selectOne = db.query("SELECT * FROM users WHERE id = ?");
			const row = selectOne.get(2);
			expect(row).toBeDefined();
			expect(row.name).toBe("Bob");

			// Query values (array of arrays)
			const selectValues = db.query("SELECT name, email FROM users ORDER BY id ASC");
			const values = selectValues.values();
			expect(values).toEqual([
				["Alice", "alice@example.com"],
				["Bob", "bob@example.com"],
			]);

			db.close();
		});

		test("transactions commit and rollback", () => {
			const db = new Database(":memory:");
			db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT)");

			const insert = db.query("INSERT INTO items (title) VALUES (?)");

			const runTransaction = db.transaction((fail: boolean) => {
				insert.run("Item 1");
				insert.run("Item 2");
				if (fail) {
					throw new Error("Transaction force fail");
				}
			});

			// Successful transaction
			runTransaction(false);
			const select = db.query("SELECT * FROM items");
			expect(select.all().length).toBe(2);

			// Failing transaction should rollback
			expect(() => runTransaction(true)).toThrow("Transaction force fail");
			expect(select.all().length).toBe(2); // Still 2, "Item 1" and "Item 2" from second call were rolled back

			db.close();
		});
	};

	describe("native Bun mode", () => {
		runTests();
	});

	let nodeSqliteAvailable = false;
	try {
		const { createRequire } = require("node:module");
		const req = createRequire(import.meta.url);
		req("node:sqlite");
		nodeSqliteAvailable = true;
	} catch (e) {
		// node:sqlite not available on this runtime (e.g. Bun)
	}

	if (nodeSqliteAvailable) {
		describe("forced Node compat mode", () => {
			beforeAll(() => {
				(globalThis as any).FORCE_NODE_COMPAT = true;
			});
			afterAll(() => {
				(globalThis as any).FORCE_NODE_COMPAT = false;
			});

			runTests();
		});
	}
});
