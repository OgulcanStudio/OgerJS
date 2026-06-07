import crypto from "node:crypto";

function toUint8Array(buf: Buffer): Uint8Array {
	return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Cryptographically secure random bytes as `Uint8Array`. */
export function randomBytes(size: number): Uint8Array {
	return toUint8Array(crypto.randomBytes(size));
}

/** RFC 4122 UUID v4 string. */
export function randomUUID(): string {
	return crypto.randomUUID();
}

/** One-shot digest; returns `Uint8Array` or encoded string when `encoding` is set. */
export function hash(
	algorithm: string,
	data: string | Uint8Array,
	encoding?: "hex" | "base64" | "latin1",
): string | Uint8Array {
	const digest = crypto.createHash(algorithm).update(data).digest();
	if (!encoding) return toUint8Array(digest);
	return digest.toString(encoding);
}

/** One-shot HMAC; returns `Uint8Array` or encoded string when `encoding` is set. */
export function hmac(
	algorithm: string,
	key: string | Uint8Array,
	data: string | Uint8Array,
	encoding?: "hex" | "base64" | "latin1",
): string | Uint8Array {
	const digest = crypto.createHmac(algorithm, key).update(data).digest();
	if (!encoding) return toUint8Array(digest);
	return digest.toString(encoding);
}

/** Constant-time comparison for secrets and MACs. */
export function timingSafeEqual(
	a: Uint8Array | Buffer,
	b: Uint8Array | Buffer,
): boolean {
	const aBuf = Buffer.isBuffer(a) ? a : Buffer.from(a);
	const bBuf = Buffer.isBuffer(b) ? b : Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return crypto.timingSafeEqual(aBuf, bBuf);
}

/** RFC 9562 UUID v7 string based on millisecond timestamp. */
export function randomUUIDv7(): string {
	const now = Date.now();
	const randomBytes = crypto.randomBytes(10);

	// Set version to 7 (first 4 bits of bytes[0] to 0111)
	randomBytes[0] = (randomBytes[0] & 0x0f) | 0x70;
	// Set variant to 2 (first 2 bits of bytes[2] to 10)
	randomBytes[2] = (randomBytes[2] & 0x3f) | 0x80;

	const timestampHex = now.toString(16).padStart(12, "0");
	const part1 = timestampHex.slice(0, 8);
	const part2 = timestampHex.slice(8, 12);
	const part3 = Array.from(randomBytes.slice(0, 2), b => b.toString(16).padStart(2, "0")).join("");
	const part4 = Array.from(randomBytes.slice(2, 4), b => b.toString(16).padStart(2, "0")).join("");
	const part5 = Array.from(randomBytes.slice(4, 10), b => b.toString(16).padStart(2, "0")).join("");

	return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
