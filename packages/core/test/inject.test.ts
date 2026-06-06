import { describe, expect, test } from "bun:test";
import { buildInjectRequest, Oger, t } from "../src";

describe("inject / handleRequest", () => {
	test("inject GET by path string", async () => {
		const app = new Oger().get("/hello", () => "hi");
		const res = await app.inject("/hello");
		expect(await res.text()).toBe("hi");
	});

	test("inject POST with JSON body", async () => {
		const app = new Oger().post("/", ({ body }) => body, {
			body: t.Object({ name: t.String() }),
		});
		const res = await app.inject({
			method: "POST",
			path: "/",
			body: { name: "Ada" },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "Ada" });
	});

	test("handleRequest alias", async () => {
		const app = new Oger().get("/alias", () => "ok");
		const res = await app.handleRequest("/alias");
		expect(await res.text()).toBe("ok");
	});

	test("buildInjectRequest query string", () => {
		const req = buildInjectRequest({ path: "/search", query: { q: "a" } });
		expect(new URL(req.url).searchParams.get("q")).toBe("a");
	});
});
