import { describe, expect, test } from "bun:test";
import {
	formatEnvForLog,
	loadEnv,
	maskEnvValue,
	t,
	ValidationError,
} from "../src";

describe("loadEnv", () => {
	test("validates process env against schema", () => {
		const prev = process.env.PORT;
		process.env.PORT = "4000";
		try {
			const env = loadEnv(
				t.Object({
					PORT: t.Integer(),
				}),
			);
			expect(env.PORT).toBe(4000);
		} finally {
			if (prev === undefined) delete process.env.PORT;
			else process.env.PORT = prev;
		}
	});

	test("throws ValidationError on invalid env", () => {
		const prev = process.env.BAD_PORT;
		process.env.BAD_PORT = "not-a-number";
		try {
			expect(() =>
				loadEnv(
					t.Object({
						BAD_PORT: t.Integer(),
					}),
				),
			).toThrow(ValidationError);
		} finally {
			if (prev === undefined) delete process.env.BAD_PORT;
			else process.env.BAD_PORT = prev;
		}
	});

	test("maskEnvValue redacts secrets", () => {
		expect(maskEnvValue("super-secret-key")).toMatch(/\*+-key$/);
	});

	test("formatEnvForLog masks secret keys", () => {
		const out = formatEnvForLog({ API_KEY: "abc123xyz", PORT: 3000 });
		expect(out.PORT).toBe(3000);
		expect(String(out.API_KEY)).toContain("*");
	});
});
