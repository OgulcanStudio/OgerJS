import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openFile } from "../src/file";

describe("file compatibility layer", () => {
	let dir: string;
	let filePath: string;
	const content = "OgerJS cross-runtime file API verification";

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "oger-compat-file-"));
		filePath = join(dir, "sample.txt");
		await writeFile(filePath, content, "utf8");
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	const runTests = () => {
		test("exists, stat, text, arrayBuffer, stream", async () => {
			const file = openFile(filePath);

			expect(file.path).toBe(filePath);
			expect(await file.exists()).toBe(true);
			expect(await openFile(join(dir, "missing.txt")).exists()).toBe(false);

			const stat = await file.stat();
			expect(stat.size).toBe(Buffer.byteLength(content, "utf8"));
			expect(stat.lastModified).toBeGreaterThan(0);

			expect(await file.text()).toBe(content);

			const buf = await file.arrayBuffer();
			expect(new TextDecoder().decode(buf)).toBe(content);

			const reader = file.stream().getReader();
			const chunks: Uint8Array[] = [];
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(value);
			}
			const streamed = new TextDecoder().decode(
				chunks.length === 1
					? chunks[0]!
					: Buffer.concat(chunks.map((c) => Buffer.from(c))),
			);
			expect(streamed).toBe(content);
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
