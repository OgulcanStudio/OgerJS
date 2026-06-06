import fs from "node:fs";
import { Readable } from "node:stream";
import { useBunNative } from "./runtime";

export interface FileStat {
	size: number;
	lastModified: number;
}

/** Cross-runtime file handle (Bun.file on Bun, node:fs on Node.js). */
export class CompatFile {
	private readonly _path: string;
	private readonly _isBun: boolean;
	private readonly _bunFile: any;

	constructor(path: string) {
		this._path = path;
		this._isBun = useBunNative();
		if (this._isBun) {
			this._bunFile = Bun.file(path);
		}
	}

	get path(): string {
		return this._path;
	}

	async exists(): Promise<boolean> {
		if (this._isBun && this._bunFile) {
			return this._bunFile.exists();
		}
		try {
			const stat = await fs.promises.stat(this._path);
			return stat.isFile();
		} catch {
			return false;
		}
	}

	async stat(): Promise<FileStat> {
		if (this._isBun && this._bunFile) {
			return {
				size: this._bunFile.size,
				lastModified: this._bunFile.lastModified,
			};
		}
		const nodeStat = await fs.promises.stat(this._path);
		return {
			size: nodeStat.size,
			lastModified: Math.floor(nodeStat.mtimeMs),
		};
	}

	async text(): Promise<string> {
		if (this._isBun && this._bunFile) {
			return this._bunFile.text();
		}
		return fs.promises.readFile(this._path, "utf8");
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		if (this._isBun && this._bunFile) {
			return this._bunFile.arrayBuffer();
		}
		const buf = await fs.promises.readFile(this._path);
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	}

	stream(): ReadableStream<Uint8Array> {
		if (this._isBun && this._bunFile) {
			return this._bunFile.stream();
		}
		return Readable.toWeb(
			fs.createReadStream(this._path),
		) as ReadableStream<Uint8Array>;
	}
}

/** Open a file with a unified cross-runtime API. */
export function openFile(path: string): CompatFile {
	return new CompatFile(path);
}
