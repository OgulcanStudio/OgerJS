import { describe, expect, test } from "bun:test";
import { adaptValidator, fromStandardSchema, safeStringify } from "../src";
import { compileSchema } from "../src/schema/compile";

describe("schema adapter", () => {
	test("adaptValidator wraps custom validate fn", () => {
		const schema = adaptValidator((input) =>
			typeof input === "string"
				? { success: true, value: input }
				: { success: false, issues: [] },
		);
		const validate = compileSchema(schema);
		expect(validate("x").success).toBe(true);
	});

	test("fromStandardSchema bridges Standard Schema v1", () => {
		const external = {
			"~standard": {
				version: 1 as const,
				vendor: "test",
				validate(value: unknown) {
					if (typeof value === "number") return { value };
					return { issues: [{ message: "expected number" }] };
				},
			},
		};
		const schema = fromStandardSchema(external);
		const validate = compileSchema(schema);
		expect(validate(42).success).toBe(true);
		expect(validate("nope").success).toBe(false);
	});
});

describe("serialize", () => {
	test("safeStringify handles BigInt and Date", () => {
		const out = safeStringify({
			at: new Date("2020-01-01T00:00:00.000Z"),
			n: 1n,
		});
		expect(out).toContain("2020-01-01");
		expect(out).toContain('"1"');
	});

	test("safeStringify redacts sensitive keys", () => {
		const out = safeStringify({ password: "secret" }, { redact: true });
		expect(out).toContain("[REDACTED]");
		expect(out).not.toContain("secret");
	});
});
