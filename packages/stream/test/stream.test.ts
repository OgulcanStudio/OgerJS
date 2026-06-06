import { describe, expect, test } from "bun:test";
import { streamCsv, streamJsonLines, streamLines } from "../src";

describe("@ogerjs/stream", () => {
	test("streamJsonLines emits NDJSON", async () => {
		const res = streamJsonLines([{ a: 1 }, { b: 2 }]);
		const text = await res.text();
		expect(text).toBe('{"a":1}\n{"b":2}\n');
	});

	test("streamCsv includes header", async () => {
		const res = streamCsv([["x"]], { header: ["col"] });
		expect(await res.text()).toBe("col\nx\n");
	});

	test("streamLines", async () => {
		const res = streamLines(["one", "two"]);
		expect(await res.text()).toBe("one\ntwo\n");
	});
});
