import fs from "node:fs";
import { Readable } from "node:stream";

export class BunFileShim extends Blob {
	readonly path: string;

	constructor(path: string) {
		// We pass an empty array to super() because BunFile is lazy-loaded and doesn't hold data in memory.
		super([]);
		this.path = path;
	}

	get lastModified(): number {
		try {
			return fs.statSync(this.path).mtimeMs;
		} catch {
			return 0;
		}
	}

	get name(): string {
		return this.path;
	}

	override get size(): number {
		try {
			return fs.statSync(this.path).size;
		} catch {
			return 0;
		}
	}

	override get type(): string {
		const ext = this.path.split(".").pop() || "";
		const mimes: Record<string, string> = {
			html: "text/html",
			css: "text/css",
			js: "text/javascript",
			ts: "text/typescript",
			json: "application/json",
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			gif: "image/gif",
			svg: "image/svg+xml",
			txt: "text/plain",
			pdf: "application/pdf",
		};
		return mimes[ext.toLowerCase()] || "application/octet-stream";
	}

	async exists(): Promise<boolean> {
		try {
			const stat = await fs.promises.stat(this.path);
			return stat.isFile();
		} catch {
			return false;
		}
	}

	override async text(): Promise<string> {
		return fs.promises.readFile(this.path, "utf8");
	}

	async json(): Promise<any> {
		const text = await this.text();
		return JSON.parse(text);
	}

	override async arrayBuffer(): Promise<ArrayBuffer> {
		const buf = await fs.promises.readFile(this.path);
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	}

	override stream(): any {
		return Readable.toWeb(fs.createReadStream(this.path)) as any;
	}

	writer(): any {
		const fd = fs.openSync(this.path, "w");
		let written = 0;
		return {
			write(chunk: any) {
				let buf: Buffer;
				if (typeof chunk === "string") {
					buf = Buffer.from(chunk);
				} else if (ArrayBuffer.isView(chunk)) {
					buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
				} else if (chunk instanceof ArrayBuffer) {
					buf = Buffer.from(chunk);
				} else {
					buf = Buffer.from(String(chunk));
				}
				fs.writeSync(fd, buf, 0, buf.length);
				written += buf.length;
			},
			flush() {
				fs.fsyncSync(fd);
				return Promise.resolve(written);
			},
			end() {
				fs.closeSync(fd);
				return Promise.resolve(written);
			},
		};
	}

	slice(start?: number, end?: number, contentType?: string): Blob {
		const size = this.size;
		const s = start !== undefined ? (start < 0 ? Math.max(size + start, 0) : Math.min(start, size)) : 0;
		const e = end !== undefined ? (end < 0 ? Math.max(size + end, 0) : Math.min(end, size)) : size;
		return new BunFileSliceShim(this.path, s, e, contentType || this.type);
	}
}

export class BunFileSliceShim extends Blob {
	readonly parentPath: string;
	readonly start: number;
	readonly end: number;
	private _type: string;

	constructor(parentPath: string, start: number, end: number, type?: string) {
		super([]);
		this.parentPath = parentPath;
		this.start = start;
		this.end = end;
		this._type = type || "";
	}

	override get type(): string {
		return this._type;
	}

	override get size(): number {
		try {
			const totalSize = fs.statSync(this.parentPath).size;
			return Math.max(0, Math.min(totalSize, this.end) - this.start);
		} catch {
			return 0;
		}
	}

	override async text(): Promise<string> {
		const buf = await this._readSlice();
		return buf.toString("utf8");
	}

	override async arrayBuffer(): Promise<ArrayBuffer> {
		const buf = await this._readSlice();
		return (buf.buffer as ArrayBuffer).slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	}

	override stream(): any {
		const size = this.size;
		if (size === 0) {
			return new ReadableStream({
				start(controller) {
					controller.close();
				}
			});
		}
		const readableNodeStream = fs.createReadStream(this.parentPath, {
			start: this.start,
			end: this.start + size - 1,
		});
		return Readable.toWeb(readableNodeStream) as any;
	}

	private async _readSlice(): Promise<Buffer> {
		const size = this.size;
		if (size === 0) return Buffer.alloc(0);
		const fd = await fs.promises.open(this.parentPath, "r");
		try {
			const buf = Buffer.alloc(size);
			await fd.read(buf, 0, size, this.start);
			return buf;
		} finally {
			await fd.close();
		}
	}
}

