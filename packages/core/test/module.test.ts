import { describe, expect, test } from "bun:test";
import { defineController, defineModule, Oger } from "../src";

describe("defineModule / defineController", () => {
	test("module setup registers routes", async () => {
		const USERS = Symbol("users");
		const app = new Oger().use(
			defineModule({
				name: "users",
				providers: [{ token: USERS, useValue: ["a", "b"] }],
				setup: ({ app: mod, container }) => {
					const list = container.resolve<string[]>(USERS);
					mod.get("/users", () => list);
				},
			}),
		);
		const res = await app.inject("/users");
		expect(await res.json()).toEqual(["a", "b"]);
	});

	test("defineController groups routes", async () => {
		const app = new Oger().use(
			defineController({
				prefix: "/api",
				routes: [{ method: "get", path: "/ping", handler: () => "pong" }],
			}),
		);
		const res = await app.inject("/api/ping");
		expect(await res.text()).toBe("pong");
	});
});
