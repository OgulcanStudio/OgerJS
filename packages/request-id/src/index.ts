import { definePluginWithOptionalOptions } from "@ogerjs/core";

export interface RequestIdOptions {
	/** Request/response header name. Default: `x-request-id`. */
	header?: string;
	/** ID generator when header absent. Default: `crypto.randomUUID()`. */
	generator?: () => string;
}

function defaultGenerator(): string {
	return crypto.randomUUID();
}

export const requestId = definePluginWithOptionalOptions<RequestIdOptions>(
	{ name: "@ogerjs/request-id", scope: "global" },
	(app, options) => {
		const header = (options.header ?? "x-request-id").toLowerCase();
		const generate = options.generator ?? defaultGenerator;

		return app
			.derive((ctx) => {
				const incoming =
					ctx.headers[header] ?? ctx.request.headers.get(header) ?? undefined;
				const id = incoming?.trim() || generate();
				return { requestId: id };
			})
			.beforeHandle((ctx) => {
				const id = ctx.requestId as string;
				ctx.set.headers = {
					...(ctx.set.headers ?? {}),
					[header]: id,
				};
			});
	},
	{},
);
