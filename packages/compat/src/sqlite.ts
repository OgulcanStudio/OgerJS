import { createRequire } from "node:module";
import { useBunNative } from "./runtime";

const requireModule = createRequire(import.meta.url);

function countParams(sql: string): number {
	let count = 0;
	let inString = false;
	let stringChar = "";
	let inComment = false;
	let inMultilineComment = false;
	const namedParams = new Set<string>();
	let maxPositional = 0;

	for (let i = 0; i < sql.length; i++) {
		const char = sql[i];
		const next = sql[i + 1];

		if (inMultilineComment) {
			if (char === "*" && next === "/") {
				inMultilineComment = false;
				i++;
			}
			continue;
		}
		if (inComment) {
			if (char === "\n" || char === "\r") {
				inComment = false;
			}
			continue;
		}
		if (inString) {
			if (char === stringChar) {
				if (next === stringChar) {
					i++;
				} else {
					inString = false;
				}
			}
			continue;
		}

		if (char === "-" && next === "-") {
			inComment = true;
			i++;
			continue;
		}
		if (char === "/" && next === "*") {
			inMultilineComment = true;
			i++;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			inString = true;
			stringChar = char;
			continue;
		}

		if (char === "?") {
			let j = i + 1;
			while (j < sql.length && /\d/.test(sql[j])) {
				j++;
			}
			if (j > i + 1) {
				const num = parseInt(sql.slice(i + 1, j), 10);
				if (num > maxPositional) maxPositional = num;
				i = j - 1;
			} else {
				count++;
			}
		} else if (char === "$" || char === ":" || char === "@") {
			let j = i + 1;
			while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
				j++;
			}
			if (j > i + 1) {
				const name = sql.slice(i, j);
				namedParams.add(name);
				i = j - 1;
			}
		}
	}

	if (maxPositional > 0) {
		return Math.max(count + maxPositional, namedParams.size + maxPositional);
	}
	return count + namedParams.size;
}

export interface DatabaseOptions {
	readonly?: boolean;
	create?: boolean;
}

export class Statement {
	private _stmt: any;
	private _isBun: boolean;
	private _columnNames: string[] | null = null;
	private _paramsCount: number | null = null;
	private _asClass: any = null;

	constructor(stmt: any, isBun: boolean) {
		this._stmt = stmt;
		this._isBun = isBun;
	}

	as(clazz: any): this {
		if (this._isBun) {
			this._stmt.as(clazz);
			return this;
		}
		this._asClass = clazz;
		return this;
	}

	get columnNames(): string[] {
		if (this._isBun) {
			return this._stmt.columnNames;
		}
		return this._columnNames || [];
	}

	get paramsCount(): number {
		if (this._isBun) {
			return this._stmt.paramsCount;
		}
		if (this._paramsCount === null) {
			this._paramsCount = countParams(this._stmt.sourceSQL || "");
		}
		return this._paramsCount;
	}

	get columnTypes(): (string | null)[] | null {
		if (this._isBun) {
			return this._stmt.columnTypes;
		}
		return null;
	}

	get declaredTypes(): (string | null)[] | null {
		if (this._isBun) {
			return this._stmt.declaredTypes;
		}
		return null;
	}

	get sourceSQL(): string {
		if (this._isBun) {
			return this._stmt.toString();
		}
		return this._stmt.sourceSQL || "";
	}

	get expandedSQL(): string {
		if (this._isBun) {
			return this._stmt.toString();
		}
		return this._stmt.expandedSQL || "";
	}

	all(...params: any[]): any[] {
		if (this._isBun) {
			return this._stmt.all(...params);
		}
		let res: any[];
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
			res = this._stmt.all(params[0]);
		} else {
			res = this._stmt.all(...params);
		}
		if (res && res.length > 0) {
			if (!this._columnNames) {
				this._columnNames = Object.keys(res[0]);
			}
			if (this._asClass) {
				return res.map((row) => {
					const instance = Object.create(this._asClass.prototype);
					return Object.assign(instance, row);
				});
			}
		}
		return res;
	}

	get(...params: any[]): any | undefined {
		if (this._isBun) {
			return this._stmt.get(...params);
		}
		let res: any;
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
			res = this._stmt.get(params[0]);
		} else {
			res = this._stmt.get(...params);
		}
		if (res && typeof res === "object") {
			if (!this._columnNames) {
				this._columnNames = Object.keys(res);
			}
			if (this._asClass) {
				const instance = Object.create(this._asClass.prototype);
				return Object.assign(instance, res);
			}
		}
		return res;
	}

	run(...params: any[]): { changes: number; lastInsertRowid: number } {
		if (this._isBun) {
			const res = this._stmt.run(...params);
			return {
				changes: res.changes,
				lastInsertRowid: Number(res.lastInsertRowid),
			};
		}
		let res: any;
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
			res = this._stmt.run(params[0]);
		} else {
			res = this._stmt.run(...params);
		}
		return {
			changes: res.changes,
			lastInsertRowid: Number(res.lastInsertRowid),
		};
	}

	values(...params: any[]): any[][] {
		if (this._isBun) {
			return this._stmt.values(...params);
		}
		if (typeof this._stmt.setReturnArrays === "function") {
			this._stmt.setReturnArrays(true);
			try {
				let res: any[][];
				if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
					res = this._stmt.all(params[0]);
				} else {
					res = this._stmt.all(...params);
				}
				return res;
			} finally {
				this._stmt.setReturnArrays(false);
			}
		} else {
			let res: any[];
			if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
				res = this._stmt.all(params[0]);
			} else {
				res = this._stmt.all(...params);
			}
			return res.map((row: any) => {
				if (typeof row === "object" && row !== null) {
					return Object.values(row);
				}
				return [row];
			});
		}
	}

	finalize(): void {
		if (this._isBun) {
			this._stmt.finalize();
		} else {
			if (typeof this._stmt.finalize === "function") {
				this._stmt.finalize();
			}
		}
	}

	toString(): string {
		return this.sourceSQL;
	}
}

export class Database {
	private _db: any;
	private _isBun: boolean;
	private _filename: string;
	private _inTransaction = false;

	constructor(filename: string, options?: DatabaseOptions) {
		this._filename = filename;
		this._isBun = useBunNative();
		if (this._isBun) {
			const { Database: BunDb } = requireModule("bun:sqlite");
			this._db = new BunDb(filename, options);
		} else {
			const { DatabaseSync } = requireModule("node:sqlite");
			const nodeOpts: any = {};
			if (options?.readonly !== undefined) {
				nodeOpts.readOnly = options.readonly;
			}
			this._db = new DatabaseSync(filename, nodeOpts);
		}
	}

	get filename(): string {
		if (this._isBun) {
			return this._db.filename;
		}
		return this._filename;
	}

	get inTransaction(): boolean {
		if (this._isBun) {
			return this._db.inTransaction;
		}
		return this._inTransaction;
	}

	prepare(sql: string): Statement {
		if (this._isBun) {
			return new Statement(this._db.prepare(sql), true);
		} else {
			return new Statement(this._db.prepare(sql), false);
		}
	}

	query(sql: string): Statement {
		if (this._isBun) {
			return new Statement(this._db.query(sql), true);
		} else {
			return new Statement(this._db.prepare(sql), false);
		}
	}

	exec(sql: string): void {
		this._db.exec(sql);
	}

	run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number } {
		if (this._isBun) {
			const res = this._db.run(sql, ...params);
			return {
				changes: res.changes,
				lastInsertRowid: Number(res.lastInsertRowid),
			};
		} else {
			const stmt = this._db.prepare(sql);
			const res = stmt.run(...params);
			return {
				changes: res.changes,
				lastInsertRowid: Number(res.lastInsertRowid),
			};
		}
	}

	loadExtension(path: string): void {
		this._db.loadExtension(path);
	}

	close(): void {
		this._db.close();
	}

	transaction<T extends (...args: any[]) => any>(fn: T): T {
		if (this._isBun) {
			return this._db.transaction(fn);
		}
		return ((...args: any[]) => {
			const wasInTransaction = this._inTransaction;
			if (!wasInTransaction) {
				this._db.exec("BEGIN");
				this._inTransaction = true;
			}
			try {
				const res = fn(...args);
				if (!wasInTransaction) {
					this._db.exec("COMMIT");
					this._inTransaction = false;
				}
				return res;
			} catch (err) {
				if (!wasInTransaction) {
					this._db.exec("ROLLBACK");
					this._inTransaction = false;
				}
				throw err;
			}
		}) as T;
	}
}

