import { bearer } from "@ogerjs/bearer";
import { cookie } from "@ogerjs/cookie";
import { Oger, t } from "@ogerjs/core";
import { jwt, signJwt } from "@ogerjs/jwt";

const SECRET =
	process.env.JWT_SECRET ??
	(process.env.NODE_ENV === "production"
		? (() => {
				throw new Error("JWT_SECRET is required in production");
			})()
		: "dev-secret-change-me-16");

const authPlugin = jwt({ secret: SECRET, exp: "1h" });

const app = new Oger()
	.use(cookie())
	.use(bearer())
	.use(authPlugin)
	.post(
		"/login",
		async ({ body, set }) => {
			const { username } = body as { username: string };
			const token = await signJwt({ sub: username }, SECRET);
			set.cookie = {
				session: { value: token, httpOnly: true, path: "/", maxAge: 3600 },
			};
			return { token };
		},
		{
			body: t.Object({ username: t.String() }),
		},
	)
	.get(
		"/profile",
		(ctx) => {
			const jwtPayload = (ctx as { jwt?: Record<string, unknown> }).jwt;
			return { user: jwtPayload?.sub };
		},
		{ jwt: true },
	)
	.get("/public", () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
if (import.meta.main) {
	app.listen(port);
	console.log(`Example auth listening on http://localhost:${port}`);
}

export { app };
