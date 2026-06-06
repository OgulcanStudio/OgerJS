import { describe, expect, test } from "bun:test";
import { compileSchema, t } from "../src/schema";

describe("Oger.t", () => {
	test("validates string", () => {
		const v = compileSchema(t.String({ minLength: 2 }));
		expect(v("ab").success).toBe(true);
		expect(v("a").success).toBe(false);
	});

	test("validates object", () => {
		const schema = t.Object({
			name: t.String(),
			age: t.Optional(t.Integer()),
		});
		const v = compileSchema(schema);
		expect(v({ name: "x", age: 1 }).success).toBe(true);
		expect(v({ age: 1 }).success).toBe(false);
	});

	test("rejects extra properties when additionalProperties is false", () => {
		const schema = t.Object(
			{ name: t.String() },
			{ additionalProperties: false },
		);
		const v = compileSchema(schema);
		const ok = v({ name: "x" });
		expect(ok.success).toBe(true);
		if (ok.success) expect(ok.value).toEqual({ name: "x" });
		expect(v({ name: "x", admin: true }).success).toBe(false);
	});

	test("validates union", () => {
		const v = compileSchema(t.Union([t.Literal("a"), t.Literal("b")]));
		expect(v("a").success).toBe(true);
		expect(v("c").success).toBe(false);
	});
});
