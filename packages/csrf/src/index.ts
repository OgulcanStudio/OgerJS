import { definePluginWithOptionalOptions, timingSafeEqual } from "@ogerjs/core";

export interface CsrfOptions {
	/** Cookie that stores the token. Default: `csrf`. */
	cookieName?: string;
	/** Request header carrying the token. Default: `x-csrf-token`. */
	headerName?: string;
	/** HTTP methods that require validation. */
	methods?: string[];
	/** Path prefixes to skip (e.g. `/webhooks`). */
	ignorePaths?: string[];
}

const DEFAULT_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function readCookie(header: string | null, name: string): string | undefined {
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return decodeURIComponent(rest.join("=") ?? "");
	}
	return undefined;
}

function token(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

function pathIgnored(pathname: string, prefixes: string[]): boolean {
	for (const p of prefixes) {
		if (p === pathname || pathname.startsWith(p.endsWith("/") ? p : `${p}/`))
			return true;
	}
	return false;
}

export const csrf = definePluginWithOptionalOptions<CsrfOptions>(
	{ name: "@ogerjs/csrf", scope: "global" },
	(app, options) => {
		const cookieName = options.cookieName ?? "csrf";
		const headerName = (options.headerName ?? "x-csrf-token").toLowerCase();
		const methods = new Set(
			(options.methods ?? DEFAULT_METHODS).map((m) => m.toUpperCase()),
		);
		const ignorePaths = options.ignorePaths ?? [];

		return app
			.onRequest((ctx) => {
				const url = new URL(ctx.request.url);
				if (pathIgnored(url.pathname, ignorePaths)) return;

				const existing =
					ctx.cookie[cookieName]?.value ??
					readCookie(ctx.request.headers.get("cookie"), cookieName);
				if (!existing) {
					ctx.set.cookie = {
						...(ctx.set.cookie ?? {}),
						[cookieName]: {
							value: token(),
							httpOnly: false,
							secure: process.env.NODE_ENV === "production",
							sameSite: "strict",
							path: "/",
						},
					};
				}
			})
			.beforeHandle((ctx) => {
				const method = ctx.request.method.toUpperCase();
				if (!methods.has(method)) return;

				const url = new URL(ctx.request.url);
				if (pathIgnored(url.pathname, ignorePaths)) return;

				const cookieToken =
					ctx.cookie[cookieName]?.value ??
					readCookie(ctx.request.headers.get("cookie"), cookieName);
				const headerToken =
					ctx.headers[headerName] ?? ctx.request.headers.get(headerName) ?? "";

				if (
					!cookieToken ||
					!headerToken ||
					!timingSafeEqual(cookieToken, headerToken)
				) {
					ctx.set.status = 403;
					return Response.json(
						{ error: "Invalid CSRF token" },
						{ status: 403 },
					);
				}
			});
	},
	{},
);
