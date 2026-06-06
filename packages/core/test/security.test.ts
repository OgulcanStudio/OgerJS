import { describe, expect, test } from "bun:test";
import {
	escapeHeaderValue,
	escapeHtmlAttr,
	normalizeRelativePath,
	timingSafeEqual,
} from "../src";

describe("security utilities", () => {
	test("timingSafeEqual compares secrets safely", () => {
		expect(timingSafeEqual("secret", "secret")).toBe(true);
		expect(timingSafeEqual("secret", "Secret")).toBe(false);
		expect(timingSafeEqual("a", "ab")).toBe(false);
	});

	test("normalizeRelativePath blocks traversal and null bytes", () => {
		expect(normalizeRelativePath("a/b.txt")).toBe("a/b.txt");
		expect(normalizeRelativePath("../etc/passwd")).toBeNull();
		expect(normalizeRelativePath("a%00b")).toBeNull();
	});

	test("escapeHeaderValue and escapeHtmlAttr", () => {
		expect(escapeHeaderValue('realm "x"')).toBe('realm \\"x\\"');
		expect(escapeHtmlAttr('"><script>')).toBe("&quot;&gt;&lt;script&gt;");
	});
});
