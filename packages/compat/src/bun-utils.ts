import { createRequire } from "node:module";
import { fileURLToPath as nodeFileURLToPath, pathToFileURL as nodePathToFileURL } from "node:url";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);

export function fileURLToPath(url: string | URL): string {
	return nodeFileURLToPath(url);
}

export function pathToFileURL(path: string): URL {
	return nodePathToFileURL(path);
}

export function resolveSync(
	specifier: string,
	parent?: string | URL,
): string {
	const parentPath =
		parent === undefined
			? process.cwd()
			: typeof parent === "string"
				? parent.startsWith("file:")
					? nodeFileURLToPath(parent)
					: parent
				: nodeFileURLToPath(parent);
	return require.resolve(specifier, { paths: [parentPath] });
}

/** Bun-compatible visual string width (CJK/wide chars count as 2). */
export function stringWidth(str: string): number {
	let width = 0;
	for (const char of str) {
		const code = char.codePointAt(0)!;
		if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
		if (
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe10 && code <= 0xfe1f) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x20000 && code <= 0x2fffd) ||
			(code >= 0x30000 && code <= 0x3fffd)
		) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}

export function indexOfLine(
	text: string,
	search: string,
	start = 0,
): number {
	const idx = text.indexOf("\n", start);
	if (idx === -1) return -1;
	const lineStart = start;
	const lineEnd = idx;
	const line = text.substring(lineStart, lineEnd);
	if (line.includes(search)) return lineStart;
	return indexOfLine(text, search, idx + 1);
}

export function deepMatch(actual: unknown, pattern: unknown): boolean {
	if (pattern === null || typeof pattern !== "object") {
		return actual === pattern;
	}
	if (actual === null || typeof actual !== "object") return false;
	if (Array.isArray(pattern)) {
		if (!Array.isArray(actual) || actual.length < pattern.length) return false;
		for (let i = 0; i < pattern.length; i++) {
			if (!deepMatch(actual[i], pattern[i])) return false;
		}
		return true;
	}
	for (const key of Object.keys(pattern as Record<string, unknown>)) {
		if (!deepMatch((actual as Record<string, unknown>)[key], (pattern as Record<string, unknown>)[key])) {
			return false;
		}
	}
	return true;
}

export function allocUnsafe(size: number): Uint8Array {
	return new Uint8Array(size);
}

export function concatArrayBuffers(buffers: ArrayBuffer[]): Uint8Array {
	let total = 0;
	for (const buf of buffers) total += buf.byteLength;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const buf of buffers) {
		out.set(new Uint8Array(buf), offset);
		offset += buf.byteLength;
	}
	return out;
}

export class ArrayBufferSink {
	private chunks: Uint8Array[] = [];
	private size = 0;

	write(chunk: string | ArrayBuffer | ArrayBufferView): number {
		let buf: Uint8Array;
		if (typeof chunk === "string") {
			buf = new TextEncoder().encode(chunk);
		} else if (ArrayBuffer.isView(chunk)) {
			buf = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
		} else {
			buf = new Uint8Array(chunk);
		}
		this.chunks.push(buf);
		this.size += buf.length;
		return buf.length;
	}

	end(): ArrayBuffer {
		const out = new Uint8Array(this.size);
		let offset = 0;
		for (const chunk of this.chunks) {
			out.set(chunk, offset);
			offset += chunk.length;
		}
		this.chunks = [];
		this.size = 0;
		return out.buffer;
	}
}

async function readStreamToBytes(stream: ReadableStream): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.length;
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

export async function readableStreamToArray(stream: ReadableStream): Promise<Uint8Array[]> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) chunks.push(value);
	}
	return chunks;
}

export async function readableStreamToBytes(stream: ReadableStream): Promise<Uint8Array> {
	return readStreamToBytes(stream);
}

export async function readableStreamToText(stream: ReadableStream): Promise<string> {
	const bytes = await readStreamToBytes(stream);
	return new TextDecoder().decode(bytes);
}

export async function readableStreamToJSON(stream: ReadableStream): Promise<unknown> {
	const text = await readableStreamToText(stream);
	return JSON.parse(text);
}

export async function readableStreamToBlob(stream: ReadableStream): Promise<Blob> {
	const bytes = await readStreamToBytes(stream);
	return new Blob([bytes]);
}

export async function readableStreamToFormData(stream: ReadableStream): Promise<FormData> {
	const req = new Request("http://localhost/", {
		method: "POST",
		body: stream,
		duplex: "half",
	} as RequestInit);
	return req.formData() as Promise<FormData>;
}

export function sha(
	algorithm: string,
	data: string | Uint8Array | ArrayBuffer | ArrayBufferView,
	encoding?: "hex" | "base64",
): string | Uint8Array {
	const digest = crypto.createHash(algorithm).update(data as crypto.BinaryLike).digest();
	if (!encoding) return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
	return digest.toString(encoding);
}

export function getMainModule(): boolean {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		const entryPath = nodeFileURLToPath(
			entry.startsWith("file:") ? entry : nodePathToFileURL(entry),
		);
		return import.meta.url === nodePathToFileURL(entryPath).href ||
			import.meta.url.endsWith(entryPath.replace(/\\/g, "/"));
	} catch {
		return false;
	}
}