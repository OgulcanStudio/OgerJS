import { describe, expect, test } from "bun:test";
import { readJsonBody, requestPathname } from "../src";

describe("json utilities", () => {
	test("requestPathname extracts path without URL allocation", () => {
		expect(requestPathname("http://localhost/users/1?q=2")).toBe("/users/1");
		expect(requestPathname("/only-path")).toBe("/only-path");
	});

	test("readJsonBody uses native parse for large content-length", async () => {
		const payload = {
			items: Array.from({ length: 400 }, (_, i) => ({
				id: i,
				name: `item-${i}`,
				tags: ["bench", "json-parse"],
			})),
			meta: { version: 1 },
		};
		const body = JSON.stringify(payload);
		expect(body.length).toBeGreaterThan(8192);
		const parsed = await readJsonBody(
			new Request("http://localhost/", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": String(body.length),
				},
				body,
			}),
			body.length + 1,
		);
		expect(parsed).toEqual(payload);
	});
});
