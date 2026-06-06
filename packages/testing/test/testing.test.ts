import { describe, expect, test } from "bun:test";
import { Oger } from "@ogerjs/core";
import {
	benchRoute,
	createMockContainer,
	generateContractTests,
	runContractSmokeTests,
	snapshotJson,
	TOKENS,
} from "../src";

describe("@ogerjs/testing", () => {
	test("mock container registers services", () => {
		const c = createMockContainer({ db: { query: () => [] } });
		const db = c.resolve(TOKENS.db) as { query: () => unknown[] };
		expect(typeof db.query).toBe("function");
	});

	test("generateContractTests from routes", () => {
		const app = new Oger().get("/a", () => "a", { meta: { summary: "A" } });
		const cases = generateContractTests(app.routes);
		expect(cases[0]?.path).toBe("/a");
	});

	test("runContractSmokeTests", async () => {
		const app = new Oger().get("/ok", () => "ok");
		const results = await runContractSmokeTests(app, app.routes);
		expect(results[0]?.ok).toBe(true);
	});

	test("benchRoute measures iterations", async () => {
		const app = new Oger().get("/b", () => "x");
		const result = await benchRoute(app, "/b", { iterations: 5 });
		expect(result.iterations).toBe(5);
		expect(result.avgMs).toBeGreaterThanOrEqual(0);
	});

	test("snapshotJson is stable", () => {
		expect(snapshotJson({ a: 1 })).toBe('{"a":1}\n');
	});
});
