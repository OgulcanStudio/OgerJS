import { definePluginWithOptionalOptions } from "@ogerjs/core";

export type { CorsPolicyOptions, CorsPolicyWarning } from "./policy";
export { buildCorsPolicy, validateCorsPolicy } from "./policy";

export interface CorsOptions {
	/** Allowed origin(s). Defaults to `*` when credentials is false. */
	origin?: string | string[] | boolean;
	methods?: string[];
	allowedHeaders?: string[];
	credentials?: boolean;
}

function resolveAllowOrigin(
	reqOrigin: string | null,
	configured: string | string[] | boolean | undefined,
	credentials: boolean,
): string | null {
	if (!reqOrigin) return null;

	if (configured === false) return null;

	if (credentials) {
		if (configured === "*") return null;
		if (typeof configured === "string") {
			return configured === reqOrigin ? reqOrigin : null;
		}
		if (Array.isArray(configured)) {
			return configured.includes(reqOrigin) ? reqOrigin : null;
		}
		return null;
	}

	if (configured === true) return reqOrigin;
	if (configured === undefined || configured === "*") return "*";
	if (typeof configured === "string")
		return configured === reqOrigin ? reqOrigin : null;
	if (Array.isArray(configured))
		return configured.includes(reqOrigin) ? reqOrigin : null;

	return null;
}

export const cors = definePluginWithOptionalOptions<CorsOptions>(
	{ name: "@ogerjs/cors", scope: "global" },
	(app, options) => {
		const methods = options.methods ?? [
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
			"OPTIONS",
			"HEAD",
		];
		const allowedHeaders = options.allowedHeaders ?? [
			"content-type",
			"authorization",
		];
		const credentials = options.credentials ?? false;

		return app
			.onRequest((ctx) => {
				const reqOrigin = ctx.request.headers.get("origin");
				const allowOrigin = resolveAllowOrigin(
					reqOrigin,
					options.origin,
					credentials,
				);
				if (!allowOrigin) return;

				ctx.set.headers = {
					...(ctx.set.headers ?? {}),
					"Access-Control-Allow-Origin": allowOrigin,
					"Access-Control-Allow-Methods": methods.join(", "),
					"Access-Control-Allow-Headers": allowedHeaders.join(", "),
					...(credentials
						? { "Access-Control-Allow-Credentials": "true" }
						: {}),
					Vary: "Origin",
				};
			})
			.options("/*", () => new Response(null, { status: 204 }));
	},
	{},
);
