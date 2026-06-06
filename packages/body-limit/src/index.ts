import { assertMutatingBodyLimit, definePluginWithOptions } from "@ogerjs/core";
import { type RouteBodyLimitRule, resolveBodyLimit } from "./limits";

export {
	type ResolvedBodyLimit,
	type RouteBodyLimitRule,
	resolveBodyLimit,
} from "./limits";

export interface BodyLimitOptions {
	/** Maximum request body size in bytes. */
	maxSize: number;
	/** Per-route, content-type, or tenant overrides. */
	rules?: RouteBodyLimitRule[];
	/** Header used for tenant-scoped limits. Default: `x-tenant-id`. */
	tenantHeader?: string;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const bodyLimit = definePluginWithOptions<BodyLimitOptions>(
	{ name: "@ogerjs/body-limit", scope: "global" },
	(app, options) =>
		app.beforeHandle((ctx) => {
			if (!MUTATING.has(ctx.request.method)) return;

			const pathname = new URL(ctx.request.url).pathname;
			const tenantHeader = options.tenantHeader ?? "x-tenant-id";
			const tenantId =
				ctx.headers[tenantHeader] ??
				ctx.request.headers.get(tenantHeader) ??
				undefined;

			const resolved = resolveBodyLimit(
				{
					pathname,
					contentType: ctx.request.headers.get("content-type"),
					tenantId: tenantId ?? undefined,
				},
				options.maxSize,
				options.rules,
			);

			try {
				assertMutatingBodyLimit(ctx.request, resolved.maxSize);
			} catch (err) {
				const status =
					err && typeof err === "object" && "status" in err
						? Number((err as { status: number }).status)
						: 413;
				ctx.set.status = status;
				return Response.json(
					{
						error:
							err instanceof Error ? err.message : "Payload too large",
						limit: resolved.maxSize,
						source: resolved.source,
					},
					{ status },
				);
			}
		}),
	(opts) => opts.maxSize,
);
