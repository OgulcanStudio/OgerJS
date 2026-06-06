import { describe, expect, test } from "bun:test";
import { matchWebSocketRoute, TopicPubSub } from "../src";

describe("@ogerjs/ws router", () => {
	test("matchWebSocketRoute captures params", () => {
		const match = matchWebSocketRoute("/chat/room-1", [
			{ path: "/chat/:room", handlers: {} },
		]);
		expect(match?.params.room).toBe("room-1");
	});

	test("TopicPubSub publish", () => {
		const pubsub = new TopicPubSub();
		const sent = { n: 0 };
		const ws = {
			send: () => {
				sent.n += 1;
			},
		} as import("bun").ServerWebSocket<unknown>;
		pubsub.subscribe("t1", ws);
		expect(pubsub.publish("t1", "hi")).toBe(1);
		expect(sent.n).toBe(1);
	});
});
