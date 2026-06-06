import { describe, expect, test } from "bun:test";
import { Oger } from "../src";
import { assertContractHandlers, defineContract } from "../src/contract";

describe("contract mode scaffold", () => {
	test("defineContract returns opaque handle", () => {
		const c = defineContract({ getUser: { path: "/users/:id" } });
		expect(c).toEqual({});
	});

	test("assertContractHandlers is no-op", () => {
		expect(() => assertContractHandlers([], [])).not.toThrow();
	});

	test("Oger defaults to handler-first", () => {
		const app = new Oger();
		expect(app.contractMode).toBe("handler-first");
	});

	test("contract-first config", () => {
		const app = new Oger({ contractMode: "contract-first" });
		expect(app.contractMode).toBe("contract-first");
	});
});
