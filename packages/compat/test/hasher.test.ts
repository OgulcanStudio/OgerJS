import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { CryptoHasher } from "../src/hasher";

describe("CryptoHasher compatibility layer", () => {
	const runTests = () => {
		test("simple sha256 hashing", () => {
			const hasher = new CryptoHasher("sha256");
			hasher.update("hello");
			hasher.update(" world");
			const hex = hasher.digest("hex");
			// sha256 of "hello world"
			expect(hex).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
		});

		test("sha256 hashing returning Uint8Array", () => {
			const hasher = new CryptoHasher("sha256");
			hasher.update("hello world");
			const binary = hasher.digest();
			expect(binary).toBeInstanceOf(Uint8Array);
			expect(binary.length).toBe(32);
			const expectedHex = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
			expect(Buffer.from(binary).toString("hex")).toBe(expectedHex);
		});

		test("sha256 HMAC hashing", () => {
			const key = "my-secret-key";
			const hasher = new CryptoHasher("sha256", key);
			hasher.update("hello world");
			const hex = hasher.digest("hex");
			// HMAC sha256 of "hello world" with key "my-secret-key"
			const expectedHex = "90eb182d8396f16d4341d582047f45c0a97d73388c5377d9ced478a2212295ad";
			expect(hex).toBe(expectedHex);
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
