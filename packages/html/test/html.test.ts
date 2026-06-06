import { describe, expect, test } from "bun:test";
import { html, htmlLayout, PACKAGE_NAME } from "../src";

describe("@ogerjs/html", () => {
	test("PACKAGE_NAME", () => {
		expect(PACKAGE_NAME).toBe("@ogerjs/html");
	});

	test("html response", async () => {
		const res = html("<p>hi</p>", 201);
		expect(res.status).toBe(201);
		expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(await res.text()).toBe("<p>hi</p>");
	});

	test("htmlLayout wraps body", () => {
		const doc = htmlLayout("Title", "<main>x</main>");
		expect(doc).toContain("<title>Title</title>");
		expect(doc).toContain("<main>x</main>");
	});
});
