import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);

export interface DatabaseOptions {
	readonly?: boolean;
	create?: boolean;
}

export class Statement {
	private _stmt: any;
	private _isBun: boolean;

	constructor(stmt: any, isBun: boolean) {
		this._stmt = stmt;
		this._isBun = isBun;
	}

	all(...params: any[]): any[] {
		if (this._isBun) {
			return this._stmt.all(...params);
		}
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
			return this._stmt.all(params[0]);
		}
		return this._stmt.all(...params);
	}

	get(...params: any[]): any | undefined {
		if (this._isBun) {
			return this._stmt.get(...params);
		}
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
			return this._stmt.get(params[0]);
		}
		return this._stmt.get(...params);
	}

	run(...params: any[]): { changes: number; lastInsertRowid: number } {
		if (this._isBun) {
			const res = this._stmt.run(...params);
			return {
				changes: res.changes,
				lastInsertRowid: Number(res.lastInsertRowid),
			};
		}
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
			const res = this._stmt.run(params[0]);
			return {
				changes: res.changes,
				lastInsertRowid: Number(res.lastInsertRowid),
			};
		}
		const res = this._stmt.run(...params);
		return {
			changes: res.changes,
			lastInsertRowid: Number(res.lastInsertRowid),
		};
	}

	values(...params: any[]): any[][] {
		if (this._isBun) {
			return this._stmt.values(...params);
		}
		this._stmt.setReturnArrays(true);
		try {
			if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
				return this._stmt.all(params[0]);
			}
			return this._stmt.all(...params);
		} finally {
			this._stmt.setReturnArrays(false);
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
		return this._stmt.toString();
	}
}

export class Database {
	private _db: any;
	private _isBun: boolean;

	constructor(filename: string, options?: DatabaseOptions) {
		this._isBun = typeof Bun !== "undefined" && !(globalThis as any).FORCE_NODE_COMPAT;
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

	close(): void {
		this._db.close();
	}

	transaction<T extends (...args: any[]) => any>(fn: T): T {
		if (this._isBun) {
			return this._db.transaction(fn);
		}
		return ((...args: any[]) => {
			this._db.exec("BEGIN");
			try {
				const res = fn(...args);
				this._db.exec("COMMIT");
				return res;
			} catch (err) {
				this._db.exec("ROLLBACK");
				throw err;
			}
		}) as T;
	}
}
