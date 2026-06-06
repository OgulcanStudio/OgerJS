import { describe, expect, test } from "bun:test";
import { defineAuthPlugin, Oger } from "../src";

describe("defineAuthPlugin", () => {
	test("registers auth macro", async () => {
		const auth = defineAuthPlugin({ name: "@ogerjs/test-auth" }, () => ({
			resolve: async () => ({ user: { id: "1" } }),
		}));

		const app = new Oger()
			.use(auth())
			.get("/me", (ctx) => (ctx as { user?: { id: string } }).user, {
				auth: true,
			});

		const res = await app.handle(new Request("http://localhost/me"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: "1" });
	});

	test("short-circuits with Response", async () => {
		const auth = defineAuthPlugin({ name: "@ogerjs/test-auth-deny" }, () => ({
			resolve: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
		}));

		const app = new Oger()
			.use(auth())
			.get("/secret", () => "ok", { auth: true });
		const res = await app.handle(new Request("http://localhost/secret"));
		expect(res.status).toBe(401);
	});
});
