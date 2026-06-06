import { clientIp, definePluginWithOptions } from "@ogerjs/core";
import {
	type AdaptiveRateLimitOptions,
	createAdaptiveLimiter,
} from "./adaptive";

export {
	AdaptiveLimiter,
	type AdaptiveLimiterOptions,
	type AdaptiveRateLimitOptions,
	createAdaptiveLimiter,
	type SuspicionEvent,
} from "./adaptive";

export interface RateLimitOptions {
	/** Max requests per window per key. */
	max: number;
	/** Window size in milliseconds. Default: 60_000. */
	windowMs?: number;
	/** Key extractor. Default: client IP from `x-forwarded-for` or `127.0.0.1`. */
	keyGenerator?: (ctx: {
		request: Request;
		headers: Record<string, string>;
	}) => string;
	/** Response message when limited. Default: `Too Many Requests`. */
	message?: string;
	/** Trust `x-forwarded-for` for the default key. Default: false. */
	trustProxy?: boolean;
}

interface Bucket {
	count: number;
	resetAt: number;
}

function defaultKey(
	ctx: { request: Request; headers: Record<string, string> },
	trustProxy: boolean,
): string {
	const remote = (ctx.request as { _remoteAddress?: string })._remoteAddress;
	if (remote) return remote;
	return clientIp(ctx.request, ctx.headers, { trustProxy });
}

function isAdaptive(
	options: RateLimitOptions | AdaptiveRateLimitOptions,
): options is AdaptiveRateLimitOptions {
	return "adaptive" in options && options.adaptive !== undefined;
}

function pruneBuckets(buckets: Map<string, Bucket>, now: number): void {
	if (buckets.size < 10_000) return;
	for (const [key, bucket] of buckets) {
		if (now >= bucket.resetAt) buckets.delete(key);
	}
}

export const rateLimit = definePluginWithOptions<
	RateLimitOptions | AdaptiveRateLimitOptions
>(
	{ name: "@ogerjs/rate-limit", scope: "global" },
	(app, options) => {
		const windowMs = options.windowMs ?? 60_000;
		const trustProxy = options.trustProxy ?? false;
		const keyGenerator =
			options.keyGenerator ?? ((ctx) => defaultKey(ctx, trustProxy));
		const message = options.message ?? "Too Many Requests";

		if (isAdaptive(options)) {
			const adaptive = createAdaptiveLimiter(options);
			const trackNotFound = options.trackNotFound ?? true;

			const plugin = app
				.beforeHandle((ctx) => {
					const key = keyGenerator(ctx);
					const ua = ctx.request.headers.get("user-agent") ?? "";
					if (!ua.trim()) {
						adaptive.recordSuspicion(key, { kind: "bad_ua" });
					}

					const result = adaptive.consume(key);
					ctx.set.headers = {
						...(ctx.set.headers ?? {}),
						"X-RateLimit-Limit": String(result.max),
						"X-RateLimit-Remaining": String(result.remaining),
						"X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
						...(result.tightened ? { "X-RateLimit-Policy": "tightened" } : {}),
					};

					if (!result.allowed) {
						ctx.set.status = 429;
						return Response.json({ error: message }, { status: 429 });
					}
				})
				.afterHandle((ctx) => {
					if (!trackNotFound) return;
					const pending = ctx.pendingResult;
					const status =
						pending instanceof Response
							? pending.status
							: (ctx.set.status ?? 200);
					if (status === 404) {
						const key = keyGenerator(ctx);
						adaptive.recordSuspicion(key, { kind: "not_found" });
					}
				});

			return plugin;
		}

		const buckets = new Map<string, Bucket>();

		return app.beforeHandle((ctx) => {
			const key = keyGenerator(ctx);
			const now = Date.now();
			pruneBuckets(buckets, now);
			let bucket = buckets.get(key);

			if (!bucket || now >= bucket.resetAt) {
				bucket = { count: 0, resetAt: now + windowMs };
				buckets.set(key, bucket);
			}

			bucket.count += 1;

			const remaining = Math.max(0, options.max - bucket.count);
			ctx.set.headers = {
				...(ctx.set.headers ?? {}),
				"X-RateLimit-Limit": String(options.max),
				"X-RateLimit-Remaining": String(remaining),
				"X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
			};

			if (bucket.count > options.max) {
				ctx.set.status = 429;
				return Response.json({ error: message }, { status: 429 });
			}
		});
	},
	(options) =>
		`${options.max}:${options.windowMs ?? 60_000}:${isAdaptive(options) ? "adaptive" : "fixed"}`,
);
