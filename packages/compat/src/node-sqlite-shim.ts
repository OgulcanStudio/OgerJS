import { Database as BunDatabase } from "bun:sqlite";

export class StatementSync {
	private _stmt: any;

	constructor(stmt: any) {
		this._stmt = stmt;
	}

	get sourceSQL(): string {
		return this._stmt.toString();
	}

	all(...params: any[]): any[] {
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0]) && !(params[0] instanceof Uint8Array)) {
			return this._stmt.all(params[0]);
		}
		return this._stmt.all(...params);
	}

	get(...params: any[]): any | undefined {
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0]) && !(params[0] instanceof Uint8Array)) {
			return this._stmt.get(params[0]);
		}
		return this._stmt.get(...params);
	}

	iterate(...params: any[]): IterableIterator<any> {
		const rows = this.all(...params);
		return rows[Symbol.iterator]();
	}

	run(...params: any[]): { changes: number; lastInsertRowid: number } {
		let res: any;
		if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0]) && !(params[0] instanceof Uint8Array)) {
			res = this._stmt.run(params[0]);
		} else {
			res = this._stmt.run(...params);
		}
		return {
			changes: res.changes,
			lastInsertRowid: Number(res.lastInsertRowid),
		};
	}

	setAllowUnknownNamedParameters(allow: boolean): void {
		// no-op in bun:sqlite
	}
}

export class DatabaseSync {
	private _db: BunDatabase;

	constructor(filename: string, options?: { readOnly?: boolean }) {
		const bunOpts: any = {};
		if (options?.readOnly !== undefined) {
			bunOpts.readonly = options.readOnly;
		}
		if (Object.keys(bunOpts).length > 0) {
			this._db = new BunDatabase(filename, bunOpts);
		} else {
			this._db = new BunDatabase(filename);
		}
	}

	close(): void {
		this._db.close();
	}

	exec(sql: string): void {
		this._db.exec(sql);
	}

	prepare(sql: string): StatementSync {
		return new StatementSync(this._db.prepare(sql));
	}

	function(name: string, options: any, fn?: any): void {
		// Bun database.customFunction can be used. Or db.function.
		// Let's implement it using this._db.run or db.function
		const actualFn = typeof options === "function" ? options : fn;
		if (typeof (this._db as any).function === "function") {
			(this._db as any).function(name, actualFn);
		}
	}

	applyChangeset(changeset: any, options?: any): void {
		// no-op/stub in Bun
	}
}

export const constants = {
	SQLITE_CHANGESET_DATA: 1,
	SQLITE_CHANGESET_OMIT: 2,
	SQLITE_CHANGESET_REPLACE: 3,
	SQLITE_CHANGESET_ABORT: 4,
};

export default {
	DatabaseSync,
	constants,
};
