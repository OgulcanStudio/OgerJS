import { describe, expect, test } from "bun:test";
import { createContainer, createTestContainer } from "../src";

describe("createContainer", () => {
	test("register and resolve values", () => {
		const c = createContainer();
		const TOKEN = Symbol("svc");
		c.register(TOKEN, { ping: () => "pong" });
		expect(c.resolve(TOKEN).ping()).toBe("pong");
	});

	test("factory resolves once (singleton)", () => {
		const c = createContainer();
		let n = 0;
		c.registerFactory("counter", () => ({ value: ++n }));
		expect(c.resolve("counter")).toEqual({ value: 1 });
		expect(c.resolve("counter")).toEqual({ value: 1 });
	});

	test("transient factory resolves each time", () => {
		const c = createContainer();
		let n = 0;
		c.registerFactory("counter", () => ({ value: ++n }), {
			scope: "transient",
		});
		expect(c.resolve("counter")).toEqual({ value: 1 });
		expect(c.resolve("counter")).toEqual({ value: 2 });
	});

	test("override for tests", () => {
		const c = createContainer();
		c.register("svc", { v: 1 });
		c.override("svc", { v: 99 });
		expect(c.resolve("svc")).toEqual({ v: 99 });
	});

	test("createTestContainer applies overrides", () => {
		const c = createTestContainer({ demo: "mock" });
		expect(c.resolve("demo")).toBe("mock");
	});

	test("request scope inherits singletons", () => {
		const root = createContainer();
		root.register("config", { env: "test" });
		const req = root.createRequestScope();
		expect(req.resolve("config")).toEqual({ env: "test" });
	});

	test("missing token throws", () => {
		const c = createContainer();
		expect(() => c.resolve("missing")).toThrow(/not registered/);
	});
});
