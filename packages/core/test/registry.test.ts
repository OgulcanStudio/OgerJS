import { describe, expect, test } from "bun:test";
import { Oger } from "../src";
import { buildRouteRegistry } from "../src/compiler/registry";

describe("RouteRegistry", () => {
	test("collects route metadata and errors", () => {
		const app = new Oger()
			.get("/items", () => [], {
				meta: { tags: ["items"], roles: ["reader"] },
				errors: { 404: { status: 404, title: "Not found", code: "NOT_FOUND" } },
			})
			.post("/items", () => ({}), {
				body: undefined,
				meta: { auth: true },
			});

		app.compile();
		const registry = app.routeRegistry;
		expect(registry.entries).toHaveLength(2);
		const get = registry.find("GET", "/items");
		expect(get?.meta?.tags).toEqual(["items"]);
		expect(get?.meta?.roles).toEqual(["reader"]);
		expect(get?.errors?.[404]?.code).toBe("NOT_FOUND");
	});

	test("buildRouteRegistry from definitions", () => {
		const routes = [
			{
				method: "GET" as const,
				path: "/health",
				handler: () => "ok",
				hooks: {},
				meta: { summary: "Health check" },
			},
		];
		const { entries } = buildRouteRegistry(routes);
		expect(entries[0]?.meta?.summary).toBe("Health check");
	});
});
