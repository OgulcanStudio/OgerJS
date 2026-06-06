import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { compress } from "../src/compress";

describe("compress compatibility layer", () => {
	const runTests = () => {
		test("gzip & gunzip round-trip with string", () => {
			const original = "OgerJS cross-runtime compression test string";
			const zipped = compress.gzip(original);
			expect(zipped).toBeInstanceOf(Uint8Array);

			const unzipped = compress.gunzip(zipped);
			expect(unzipped).toBeInstanceOf(Uint8Array);
			expect(new TextDecoder().decode(unzipped)).toBe(original);
		});

		test("gzip & gunzip round-trip with Uint8Array", () => {
			const original = new TextEncoder().encode("Hello, compatibility world!");
			const zipped = compress.gzip(original);
			const unzipped = compress.gunzip(zipped);
			expect(new TextDecoder().decode(unzipped)).toBe("Hello, compatibility world!");
		});

		test("deflate & inflate round-trip with string", () => {
			const original = "Another test string for deflate/inflate sync";
			const compressed = compress.deflate(original);
			expect(compressed).toBeInstanceOf(Uint8Array);

			const decompressed = compress.inflate(compressed);
			expect(decompressed).toBeInstanceOf(Uint8Array);
			expect(new TextDecoder().decode(decompressed)).toBe(original);
		});

		test("deflate & inflate round-trip with Uint8Array", () => {
			const original = new TextEncoder().encode("Standard Uint8Array content");
			const compressed = compress.deflate(original);
			const decompressed = compress.inflate(compressed);
			expect(new TextDecoder().decode(decompressed)).toBe("Standard Uint8Array content");
		});

		test("zstd & unzstd round-trip", () => {
			const original = "Zstandard compression cross-runtime test";
			const compressed = compress.zstd(original);
			expect(compressed).toBeInstanceOf(Uint8Array);
			const decompressed = compress.unzstd(compressed);
			expect(new TextDecoder().decode(decompressed)).toBe(original);
		});

		test("brotli & unbrotli round-trip", () => {
			const original = "Brotli compression cross-runtime test";
			const compressed = compress.brotli(original);
			expect(compressed).toBeInstanceOf(Uint8Array);
			const decompressed = compress.unbrotli(compressed);
			expect(new TextDecoder().decode(decompressed)).toBe(original);
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
