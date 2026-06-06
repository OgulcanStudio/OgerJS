import { describe, expect, test } from "bun:test";
import { requireWebSocketUpgrade } from "../src";

describe("@ogerjs/ws", () => {
	test("requireWebSocketUpgrade returns 426 for plain HTTP", () => {
		const res = requireWebSocketUpgrade(new Request("http://localhost/ws"));
		expect(res?.status).toBe(426);
	});

	test("returns null when upgrade header is websocket", () => {
		const req = new Request("http://localhost/ws", {
			headers: { upgrade: "websocket" },
		});
		expect(requireWebSocketUpgrade(req)).toBeNull();
	});
});
