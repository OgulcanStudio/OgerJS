import { definePluginWithOptions, timingSafeEqual } from "@ogerjs/core";

export interface ApiKeyOptions {
	/** Header name. Default: `x-api-key`. */
	header?: string;
	/** Query parameter name (optional second lookup). */
	query?: string;
	/** Valid keys or custom verifier. */
	validate: string[] | ((key: string) => boolean | Promise<boolean>);
}

function extractKey(
	ctx: {
		headers: Record<string, string>;
		query: Record<string, string>;
		request: Request;
	},
	header: string,
	query?: string,
): string | undefined {
	const fromHeader =
		ctx.headers[header] ?? ctx.request.headers.get(header) ?? undefined;
	if (fromHeader) return fromHeader;
	if (query) return ctx.query[query];
	return undefined;
}

async function isValidKey(
	key: string,
	validate: ApiKeyOptions["validate"],
): Promise<boolean> {
	if (Array.isArray(validate)) {
		for (const candidate of validate) {
			if (timingSafeEqual(key, candidate)) return true;
		}
		return false;
	}
	return validate(key);
}

export const apiKey = definePluginWithOptions<ApiKeyOptions>(
	{ name: "@ogerjs/api-key" },
	(app, options) => {
		const header = (options.header ?? "x-api-key").toLowerCase();
		const query = options.query;

		return app
			.derive((ctx) => ({
				apiKey: extractKey(ctx, header, query),
			}))
			.macro({
				apiKey: {
					async resolve(ctx) {
						const key = ctx.apiKey as string | undefined;
						if (!key || !(await isValidKey(key, options.validate))) {
							return Response.json({ error: "Unauthorized" }, { status: 401 });
						}
						return { apiKey: key };
					},
				},
			});
	},
	(options) => options.header ?? "x-api-key",
);
