import {
	definePluginWithOptions,
	escapeHeaderValue,
	timingSafeEqual,
} from "@ogerjs/core";

export interface BasicAuthOptions {
	username: string;
	password: string;
	realm?: string;
	/** Custom verifier; return false to reject. */
	verifyUser?: (
		username: string,
		password: string,
	) => boolean | Promise<boolean>;
}

function decodeBasic(
	authHeader: string,
): { user: string; pass: string } | null {
	if (!authHeader.startsWith("Basic ")) return null;
	try {
		const decoded = atob(authHeader.slice(6));
		const sep = decoded.indexOf(":");
		if (sep < 0) return null;
		return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
	} catch {
		return null;
	}
}

export const basicAuth = definePluginWithOptions<BasicAuthOptions>(
	{ name: "@ogerjs/basic-auth", scope: "global" },
	(app, options) => {
		const realm = options.realm ?? "secure area";

		return app.beforeHandle(async (ctx) => {
			const auth =
				ctx.headers.authorization ??
				ctx.request.headers.get("authorization") ??
				"";
			const creds = decodeBasic(auth);

			const ok =
				creds &&
				(options.verifyUser
					? await options.verifyUser(creds.user, creds.pass)
					: timingSafeEqual(creds.user, options.username) &&
						timingSafeEqual(creds.pass, options.password));

			if (ok) {
				return { basicAuth: { username: creds?.user } };
			}

			ctx.set.status = 401;
			ctx.set.headers = {
				...(ctx.set.headers ?? {}),
				"WWW-Authenticate": `Basic realm="${escapeHeaderValue(realm)}", charset="UTF-8"`,
			};
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		});
	},
	(opts) => `${opts.username}:${opts.realm ?? "secure area"}`,
);
