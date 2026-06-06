import { definePlugin } from "@ogerjs/core";

export const bearer = definePlugin({ name: "@ogerjs/bearer" }, (app) =>
	app
		.derive((ctx) => {
			const auth =
				ctx.headers.authorization ?? ctx.request.headers.get("authorization");
			const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
			return { bearer: token };
		})
		.macro({
			bearer: {
				async resolve(ctx) {
					if (!ctx.bearer) {
						return Response.json({ error: "Unauthorized" }, { status: 401 });
					}
					return { token: ctx.bearer as string };
				},
			},
		}),
);
