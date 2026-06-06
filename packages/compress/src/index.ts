import { definePluginWithOptionalOptions } from "@ogerjs/core";
import zlib from "node:zlib";

function toResponse(value: unknown): Response {
	if (value instanceof Response) return value;
	if (value === undefined || value === null)
		return new Response(null, { status: 204 });
	if (typeof value === "string") return new Response(value);
	return Response.json(value);
}

export interface CompressPathRule {
	/** Path prefix match. */
	prefix: string;
	threshold?: number;
	enabled?: boolean;
}

export interface CompressOptions {
	/** Minimum response body size (bytes) to compress. Default: 1024. */
	threshold?: number;
	/** Encoding to use. Default: `gzip` (Bun built-in). */
	encoding?: "gzip";
	/** Per-route prefix rules (first match wins). */
	pathRules?: CompressPathRule[];
}

const SKIP_TYPES = /^(image|video|audio)\//;
const ALREADY_ENCODED = /^(gzip|br|deflate)$/i;

export const compress = definePluginWithOptionalOptions<CompressOptions>(
	{ name: "@ogerjs/compress", scope: "global" },
	(app, options) => {
		const defaultThreshold = options.threshold ?? 1024;
		const pathRules = options.pathRules ?? [];

		function resolveThreshold(pathname: string): number | null {
			for (const rule of pathRules) {
				if (pathname.startsWith(rule.prefix)) {
					if (rule.enabled === false) return null;
					return rule.threshold ?? defaultThreshold;
				}
			}
			return defaultThreshold;
		}

		return app.on(
			"mapResponse",
			async (ctx) => {
				const accept = ctx.request.headers.get("accept-encoding") ?? "";
				if (!accept.includes("gzip")) return;

				const pathname = new URL(ctx.request.url).pathname;
				const threshold = resolveThreshold(pathname);
				if (threshold === null) return;

				const pending = ctx.pendingResult;
				const res = pending instanceof Response ? pending : toResponse(pending);
				if (res.status === 204 || res.status === 304 || res.body === null)
					return res;

				const existing = res.headers.get("content-encoding");
				if (existing && ALREADY_ENCODED.test(existing)) return res;

				const type = res.headers.get("content-type") ?? "";
				if (SKIP_TYPES.test(type)) return res;

				const buf = new Uint8Array(await res.arrayBuffer());
				if (buf.byteLength < threshold) {
					return new Response(buf, {
						status: res.status,
						headers: res.headers,
					});
				}

				const compressed = typeof Bun !== "undefined" ? Bun.gzipSync(buf) : zlib.gzipSync(buf);
				const headers = new Headers(res.headers);
				headers.set("content-encoding", "gzip");
				headers.delete("content-length");
				headers.set("vary", appendVary(headers.get("vary"), "Accept-Encoding"));

				return new Response(compressed, { status: res.status, headers });
			},
			"global",
		);
	},
	{ threshold: 1024, encoding: "gzip" },
);

function appendVary(existing: string | null, value: string): string {
	if (!existing) return value;
	const parts = existing.split(",").map((s) => s.trim().toLowerCase());
	if (parts.includes(value.toLowerCase())) return existing;
	return `${existing}, ${value}`;
}
