import crypto from "node:crypto";
import { useBunNative } from "./runtime";

export class CryptoHasher {
	private _hasher: any;

	constructor(algorithm: string, key?: string | Uint8Array) {
		if (useBunNative()) {
			this._hasher = new (globalThis as any).Bun.CryptoHasher(algorithm as any, key as any);
		} else {
			if (key !== undefined) {
				this._hasher = crypto.createHmac(algorithm, key);
			} else {
				this._hasher = crypto.createHash(algorithm);
			}
		}
	}

	update(data: string | Uint8Array): this {
		this._hasher.update(data);
		return this;
	}

	digest(): Uint8Array;
	digest(encoding: "hex" | "base64" | "latin1"): string;
	digest(encoding?: string): any {
		if (useBunNative()) {
			return this._hasher.digest(encoding as any);
		}
		if (!encoding) {
			const buf = this._hasher.digest();
			return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
		}
		return this._hasher.digest(encoding);
	}
}
