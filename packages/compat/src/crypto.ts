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
