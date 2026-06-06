import { describe, expect, test } from "bun:test";
import { Oger, t, timingSafeEqual } from "../src";
import { compileRoutes, matchRoute } from "../src/compiler/routes";
import type { RouteDefinition } from "../src/types";

describe("Oger", () => {
	test("GET returns string", async () => {
		const app = new Oger().get("/", () => "ok");
		const res = await app.handle(new Request("http://localhost/"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	test("params route", async () => {
		const app = new Oger().get("/users/:id", ({ params }) => params.id);
		const res = await app.handle(new Request("http://localhost/users/42"));
		expect(await res.text()).toBe("42");
	});

	test("validation 422", async () => {
		const app = new Oger().post("/", ({ body }) => body, {
			body: t.Object({ name: t.String() }),
		});
		const res = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		expect(res.status).toBe(422);
	});

	test("group prefix", async () => {
		const app = new Oger().group("/api", (g) => {
			g.get("/health", () => "healthy");
		});
		const res = await app.handle(new Request("http://localhost/api/health"));
		expect(await res.text()).toBe("healthy");
	});

	test("plugin merge", async () => {
		const plugin = new Oger().get("/plugin", () => "p");
		const app = new Oger().use(plugin);
		const res = await app.handle(new Request("http://localhost/plugin"));
		expect(await res.text()).toBe("p");
	});

	test("macro auth pattern", async () => {
		const auth = new Oger().macro({
			auth: {
				async resolve(ctx) {
					const h = ctx.headers.authorization;
					if (!h) return new Response("Unauthorized", { status: 401 });
					return { user: "test" };
				},
			},
		});
		const app = new Oger()
			.use(auth)
			.get("/me", (ctx) => (ctx as { user: string }).user, { auth: true });
		const ok = await app.handle(
			new Request("http://localhost/me", {
				headers: { authorization: "Bearer x" },
			}),
		);
		expect(await ok.text()).toBe("test");
		const fail = await app.handle(new Request("http://localhost/me"));
		expect(fail.status).toBe(401);
	});

	test("invalid JSON returns 400", async () => {
		const app = new Oger().post("/", ({ body }) => body, {
			body: t.Object({ name: t.String() }),
		});
		const res = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{not-json",
			}),
		);
		expect(res.status).toBe(400);
	});

	test("literal GET compiles to static Response for Bun routes", () => {
		const routes: RouteDefinition[] = [
			{ method: "GET", path: "/", handler: () => "ok", hooks: {} },
		];
		const { bunRoutes } = compileRoutes(routes, {
			globalHooks: {},
			store: {},
			decorators: {},
			deriveFns: [],
			bodyLimit: 1024,
		});
		const root = bunRoutes["/"];
		expect(
			root instanceof Response ||
				typeof root === "function" ||
				(typeof root === "object" && root !== null && "GET" in root),
		).toBe(true);
		expect(routes[0].staticResponse).toBeInstanceOf(Response);
	});

	test("route index matches static paths", () => {
		const routes: RouteDefinition[] = [
			{ method: "GET", path: "/health", handler: () => "ok", hooks: {} },
			{ method: "GET", path: "/users/:id", handler: () => "ok", hooks: {} },
		];
		const { compiled, index } = compileRoutes(routes, {
			globalHooks: {},
			store: {},
			decorators: {},
			deriveFns: [],
			bodyLimit: 1024,
		});
		expect(matchRoute(compiled, "GET", "/health", index)?.path).toBe("/health");
		expect(matchRoute(compiled, "GET", "/users/1", index)?.path).toBe(
			"/users/:id",
		);
		expect(matchRoute(compiled, "GET", "/missing", index)).toBeUndefined();
	});

	test("timingSafeEqual", () => {
		expect(timingSafeEqual("secret", "secret")).toBe(true);
		expect(timingSafeEqual("secret", "Secret")).toBe(false);
		expect(timingSafeEqual("a", "ab")).toBe(false);
	});
});
