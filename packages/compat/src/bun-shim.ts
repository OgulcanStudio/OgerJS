import dns from "node:dns";
import { inspect } from "node:util";
import { serve } from "./serve-shim";
import { BunFileShim } from "./file-shim";
import { write } from "./write-shim";
import { password } from "./password";
import {
	hmac,
	randomBytes,
	randomUUID,
	randomUUIDv7,
	timingSafeEqual,
} from "./crypto";
import { hash } from "./hash";
import { CryptoHasher } from "./hasher";
import { compress } from "./compress";
import { spawn, spawnSync } from "./spawn-shim";
import * as jscModule from "./jsc";
import fs from "node:fs";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import * as semver from "./semver";
import {
	allocUnsafe,
	ArrayBufferSink,
	concatArrayBuffers,
	deepMatch,
	fileURLToPath,
	getMainModule,
	indexOfLine,
	pathToFileURL,
	readableStreamToArray,
	readableStreamToBlob,
	readableStreamToBytes,
	readableStreamToFormData,
	readableStreamToJSON,
	readableStreamToText,
	resolveSync,
	sha,
	stringWidth,
} from "./bun-utils";
import { Glob } from "./glob-shim";
import { Cookie, CookieMap } from "./cookie-shim";
import { TOML } from "./toml-shim";
import { stdin, stdout, stderr } from "./stdio-shim";
import { CSRF } from "./csrf-shim";
import { color } from "./color-shim";

// Startup time for Bun.nanoseconds()
const startupTime = process.hrtime.bigint();

export function nanoseconds(): number {
	return Number(process.hrtime.bigint() - startupTime);
}

export function escapeHTML(str: string): string {
	if (typeof str !== "string") {
		str = String(str);
	}
	return str.replace(/[&<>"']/g, (m) => {
		switch (m) {
			case "&": return "&amp;";
			case "<": return "&lt;";
			case ">": return "&gt;";
			case '"': return "&quot;";
			case "'": return "&#x27;";
			default: return m;
		}
	});
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function concat(arrays: Uint8Array[]): Uint8Array {
	let totalLength = 0;
	for (let i = 0; i < arrays.length; i++) {
		totalLength += arrays[i].length;
	}
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (let i = 0; i < arrays.length; i++) {
		result.set(arrays[i], offset);
		offset += arrays[i].length;
	}
	return result;
}

export function deepEquals(a: any, b: any): boolean {
	if (a && typeof a.asymmetricMatch === "function") {
		return a.asymmetricMatch(b);
	}
	if (b && typeof b.asymmetricMatch === "function") {
		return b.asymmetricMatch(a);
	}
	if (a === b) return true;
	if (a && b && typeof a === "object" && typeof b === "object") {
		if (a.constructor !== b.constructor) return false;
		if (Array.isArray(a)) {
			const len = a.length;
			if (len !== b.length) return false;
			for (let i = 0; i < len; i++) {
				if (!deepEquals(a[i], b[i])) return false;
			}
			return true;
		}
		if (a instanceof Date) return a.getTime() === b.getTime();
		if (a instanceof RegExp) return a.toString() === b.toString();
		if (a instanceof Map) {
			if (a.size !== b.size) return false;
			for (const [key, val] of a) {
				if (!b.has(key)) return false;
				if (!deepEquals(val, b.get(key))) return false;
			}
			return true;
		}
		if (a instanceof Set) {
			if (a.size !== b.size) return false;
			for (const val of a) {
				if (!b.has(val)) return false;
			}
			return true;
		}
		if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
			const aView = a as any;
			const bView = b as any;
			if (aView.byteLength !== bView.byteLength) return false;
			const aBuf = new Uint8Array(aView.buffer, aView.byteOffset, aView.byteLength);
			const bBuf = new Uint8Array(bView.buffer, bView.byteOffset, bView.byteLength);
			for (let i = 0; i < aBuf.length; i++) {
				if (aBuf[i] !== bBuf[i]) return false;
			}
			return true;
		}
		const keys = Object.keys(a);
		if (keys.length !== Object.keys(b).length) return false;
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
			if (!deepEquals(a[key], b[key])) return false;
		}
		return true;
	}
	return a !== a && b !== b;
}

export function which(bin: string, options?: { cwd?: string; PATH?: string }): string | null {
	const envPath = options?.PATH || process.env.PATH || "";
	const cwd = options?.cwd || process.cwd();
	const pathDirs = envPath.split(path.delimiter);
	const isWindows = process.platform === "win32";
	const extensions = isWindows ? [".exe", ".cmd", ".bat", ".ps1", ""] : [""];

	if (path.isAbsolute(bin) || bin.startsWith(".") || bin.includes(path.sep)) {
		const resolved = path.resolve(cwd, bin);
		for (const ext of extensions) {
			const fullPath = resolved + ext;
			try {
				const stat = fs.statSync(fullPath);
				if (stat.isFile() && (isWindows || (stat.mode & 0o111) !== 0)) {
					return fullPath;
				}
			} catch {}
		}
		return null;
	}

	for (const dir of pathDirs) {
		const resolvedDir = path.resolve(cwd, dir);
		for (const ext of extensions) {
			const fullPath = path.join(resolvedDir, bin + ext);
			try {
				const stat = fs.statSync(fullPath);
				if (stat.isFile() && (isWindows || (stat.mode & 0o111) !== 0)) {
					return fullPath;
				}
			} catch {}
		}
	}
	return null;
}

export function openInEditor(file: string, options?: { editor?: string; line?: number; column?: number }): void {
	const editor = options?.editor || process.env.VISUAL || process.env.EDITOR || (process.platform === "win32" ? "notepad" : "vi");
	const args = [file];
	if (options?.line) {
		if (editor.includes("code") || editor.includes("cursor")) {
			args.unshift("-g");
			args[1] = `${file}:${options.line}${options.column ? `:${options.column}` : ""}`;
		}
	}
	nodeSpawn(editor, args, { stdio: "inherit", shell: true });
}

export function toBuffer(arrayBuffer: ArrayBuffer | ArrayBufferView): Buffer {
	if (ArrayBuffer.isView(arrayBuffer)) {
		return Buffer.from(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
	}
	return Buffer.from(arrayBuffer);
}

const BunCompat = {
	serve,
	file(path: string) {
		return new BunFileShim(path);
	},
	write,
	password,
	hash,
	hmac,
	randomBytes,
	randomUUID,
	randomUUIDv7,
	timingSafeEqual,
	CryptoHasher,
	gc() {
		if (typeof globalThis.gc === "function") {
			globalThis.gc();
		}
	},

	escapeHTML,
	sleep,
	sleepSync,
	concat,
	deepEquals,
	which,
	openInEditor,
	toBuffer,

	// Compression sync shims
	gzipSync: compress.gzip,
	gunzipSync: compress.gunzip,
	deflateSync: compress.deflate,
	inflateSync: compress.inflate,
	zstdCompressSync: compress.zstd,
	zstdDecompressSync: compress.unzstd,

	// Environment and version
	env: process.env,
	argv: process.argv,
	version: "1.3.14-compat",
	revision: "oger-compat-v0",

	// Process spawning
	spawn,
	spawnSync,

	// Minimal helper functions to prevent crashes
	peek(promise: any) {
		return promise;
	},
	dns: {
		lookup: dns.lookup,
		lookupService: dns.lookupService,
	},
	jsc: jscModule,
	nanoseconds,
	origin: "http://localhost",
	inspect,
	semver,

	// Extended Bun utility APIs
	stringWidth,
	fileURLToPath,
	pathToFileURL,
	resolveSync,
	indexOfLine,
	deepMatch,
	allocUnsafe,
	concatArrayBuffers,
	ArrayBufferSink,
	readableStreamToArray,
	readableStreamToBytes,
	readableStreamToText,
	readableStreamToJSON,
	readableStreamToBlob,
	readableStreamToFormData,
	sha,
	Glob,
	Cookie,
	CookieMap,
	TOML,
	stdin,
	stdout,
	stderr,
	get main() {
		return getMainModule();
	},
	CSRF,
	color,
};

if (typeof (globalThis as any).Bun === "undefined") {
	(globalThis as any).Bun = BunCompat;
}

export default BunCompat;
export { BunCompat as Bun, serve };

