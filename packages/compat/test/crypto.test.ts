import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { hash, hmac, randomBytes, randomUUID, timingSafeEqual } from "../src/crypto";

describe("crypto compatibility layer", () => {
	const runTests = () => {
		test("randomBytes returns Uint8Array of requested size", () => {
			const bytes = randomBytes(32);
			expect(bytes).toBeInstanceOf(Uint8Array);
			expect(bytes.length).toBe(32);
		});

		test("randomUUID returns RFC 4122 format", () => {
			const id = randomUUID();
			expect(id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
		});

		test("hash one-shot sha256", () => {
			expect(hash("sha256", "hello world", "hex")).toBe(
				"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
			);
			const bin = hash("sha256", "hello world");
			expect(bin).toBeInstanceOf(Uint8Array);
			expect(bin.length).toBe(32);
		});

		test("hmac one-shot sha256", () => {
			expect(hmac("sha256", "my-secret-key", "hello world", "hex")).toBe(
				"90eb182d8396f16d4341d582047f45c0a97d73388c5377d9ced478a2212295ad",
			);
		});

		test("timingSafeEqual compares byte sequences", () => {
			const a = randomBytes(16);
			const b = new Uint8Array(a);
			const c = randomBytes(16);
			expect(timingSafeEqual(a, b)).toBe(true);
			expect(timingSafeEqual(a, c)).toBe(false);
			expect(timingSafeEqual(a, randomBytes(8))).toBe(false);
		});
	};

	describe("native Bun mode", () => {
		runTests();
	});

	describe("forced Node compat mode", () => {
		beforeAll(() => {
			(globalThis as any).FORCE_NODE_COMPAT = true;
		});
		afterAll(() => {
			(globalThis as any).FORCE_NODE_COMPAT = false;
		});

		runTests();
	});
});
