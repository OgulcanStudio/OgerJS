import crypto from "node:crypto";

const CSRF_SECRET = process.env.OGER_CSRF_SECRET ?? "ogerjs-compat-csrf-secret";

export function generate(
	seed?: string,
	options?: { encoding?: "hex" | "base64"; maxAge?: number },
): string {
	const encoding = options?.encoding ?? "hex";
	const payload = `${seed ?? ""}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`;
	const digest = crypto
		.createHmac("sha256", CSRF_SECRET)
		.update(payload)
		.digest(encoding === "base64" ? "base64" : "hex");
	return `${payload}:${digest}`;
}

export function verify(
	token: string,
	options?: { encoding?: "hex" | "base64"; maxAge?: number },
): boolean {
	const encoding = options?.encoding ?? "hex";
	const parts = token.split(":");
	if (parts.length < 4) return false;
	const digest = parts.pop()!;
	const payload = parts.join(":");
	const expected = crypto
		.createHmac("sha256", CSRF_SECRET)
		.update(payload)
		.digest(encoding === "base64" ? "base64" : "hex");
	if (digest.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
}

export const CSRF = { generate, verify };