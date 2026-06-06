import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

export interface ClientIpOptions {
	/** Trust the first `x-forwarded-for` hop. Default: false. */
	trustProxy?: boolean;
}

/**
 * Best-effort client IP for rate limits and allowlists.
 * Without `trustProxy`, returns `"local"` (safe default behind unknown proxies).
 */
export function clientIp(
	request: Request,
	headers: Record<string, string> = {},
	options: ClientIpOptions = {},
): string {
	if (options.trustProxy) {
		const forwarded =
			headers["x-forwarded-for"] ??
			request.headers.get("x-forwarded-for") ??
			"";
		if (forwarded) {
			const idx = forwarded.indexOf(",");
			const first = idx === -1 ? forwarded : forwarded.substring(0, idx);
			const trimmed = first.trim();
			if (trimmed) return trimmed;
		}
	}
	return "local";
}

/**
 * Constant-time string comparison to prevent timing attacks on secrets/tokens.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) {
		const pad = aBuf.length > bBuf.length ? aBuf : bBuf;
		return nodeTimingSafeEqual(pad, pad) && false;
	}
	return nodeTimingSafeEqual(aBuf, bBuf);
}

/**
 * Returns true when `target` resolves inside `root` (prevents path traversal).
 */
export function isPathInsideRoot(root: string, target: string): boolean {
	const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
	const normalizedTarget = target.endsWith("/") ? target : `${target}/`;
	return (
		normalizedTarget.startsWith(normalizedRoot) ||
		target === root.replace(/\/$/, "")
	);
}

/**
 * Normalizes a relative file path from a URL; returns null when traversal or invalid.
 */
export function normalizeRelativePath(filePath: string): string | null {
	if (filePath.includes("\0")) return null;

	let decoded = filePath;
	try {
		decoded = decodeURIComponent(filePath);
	} catch {
		return null;
	}
	if (decoded.includes("\0")) return null;

	const segments = decoded.split(/[/\\]/);
	const out: string[] = [];
	for (const seg of segments) {
		if (!seg || seg === ".") continue;
		if (seg === "..") return null;
		out.push(seg);
	}
	return out.join("/");
}

/** Escape a value for safe use inside double-quoted HTTP header fields. */
export function escapeHeaderValue(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escape for HTML attribute contexts (e.g. Swagger UI config). */
export function escapeHtmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
