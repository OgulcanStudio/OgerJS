import { definePluginWithOptionalOptions } from "@ogerjs/core";
import crypto from "node:crypto";

export interface EtagPathRule {
	prefix: string;
	weak?: boolean;
	enabled?: boolean;
}

export interface EtagOptions {
	/** Use weak ETags (`W/"..."`). Default: false. */
	weak?: boolean;
	/** Per-path rules (first match wins). */
	pathRules?: EtagPathRule[];
}

function toResponse(value: unknown): Response {
	if (value instanceof Response) return value;
	if (value === undefined || value === null)
		return new Response(null, { status: 204 });
	if (typeof value === "string") return new Response(value);
	return Response.json(value);
}

function bodyDigest(buf: Uint8Array): string {
	if (typeof Bun !== "undefined") {
		const hash = new Bun.CryptoHasher("sha256");
		hash.update(buf);
		return hash.digest("hex");
	} else {
		const hash = crypto.createHash("sha256");
		hash.update(buf);
		return hash.digest("hex");
	}
}

export const etag = definePluginWithOptionalOptions<EtagOptions>(
	{ name: "@ogerjs/etag", scope: "global" },
	(app, options) => {
		const defaultWeak = options.weak ?? false;
		const pathRules = options.pathRules ?? [];

		function resolveRule(pathname: string): {
			weak: boolean;
			enabled: boolean;
		} {
			for (const rule of pathRules) {
				if (pathname.startsWith(rule.prefix)) {
					return {
						weak: rule.weak ?? defaultWeak,
						enabled: rule.enabled !== false,
					};
				}
			}
			return { weak: defaultWeak, enabled: true };
		}

		return app.on(
			"mapResponse",
			async (ctx) => {
				const pathname = new URL(ctx.request.url).pathname;
				const rule = resolveRule(pathname);
				if (!rule.enabled) return;

				const pending = ctx.pendingResult;
				const res = pending instanceof Response ? pending : toResponse(pending);
				if (res.status === 204 || res.body === null) return res;
				if (res.headers.has("etag")) return res;

				const buf = new Uint8Array(await res.arrayBuffer());
				const tagValue = bodyDigest(buf);
				const tag = rule.weak ? `W/"${tagValue}"` : `"${tagValue}"`;

				const ifNoneMatch = ctx.request.headers.get("if-none-match");
				if (
					ifNoneMatch
						?.split(",")
						.map((s) => s.trim())
						.includes(tag)
				) {
					return new Response(null, { status: 304, headers: { ETag: tag } });
				}

				const headers = new Headers(res.headers);
				headers.set("etag", tag);
				return new Response(buf, { status: res.status, headers });
			},
			"global",
		);
	},
	{ weak: false },
);
