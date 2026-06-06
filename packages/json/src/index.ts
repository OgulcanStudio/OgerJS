import {
	definePluginWithOptionalOptions,
	isJsonContentType,
	readJsonBody,
	stringifyJson,
} from "@ogerjs/core";

export {
	isJsonContentType,
	parseJson,
	readJsonBody,
	stringifyJson,
} from "@ogerjs/core";

export interface JsonPluginOptions {
	/** Max JSON body bytes when using eager parse (default 1 MiB). */
	bodyLimit?: number;
}

const DEFAULT_BODY_LIMIT = 1024 * 1024;

/** JSON response with a pre-serialized body (avoids `Response.json` object wrapper). */
export function jsonResponse(value: unknown, init?: ResponseInit): Response {
	const res = new Response(stringifyJson(value), init);
	if (!res.headers.has("content-type")) {
		res.headers.set("content-type", "application/json; charset=utf-8");
	}
	return res;
}

/**
 * Eagerly parses JSON request bodies in the `parse` hook so handlers see `ctx.body`
 * even without a route body schema. Core `parseBody` still runs for schema routes when
 * the body was not set here.
 */
export const json = definePluginWithOptionalOptions<JsonPluginOptions>(
	{ name: "@ogerjs/json" },
	(app, options) => {
		const limit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
		return app.parse(async (ctx) => {
			if (ctx.body !== undefined) return;
			const contentType = ctx.request.headers.get("content-type") ?? "";
			if (!isJsonContentType(contentType)) return;
			ctx.body = await readJsonBody(ctx.request, limit);
		});
	},
	{},
	(options) => options.bodyLimit ?? "default",
);
