import { describe, expect, test } from "bun:test";
import { createInMemoryEventBus, defineDomainEvent, Outbox } from "../src";

describe("@ogerjs/events", () => {
	test("defineDomainEvent preserves type", () => {
		const created = defineDomainEvent<"user.created", { id: string }>();
		const evt = created("user.created", { id: "1" });
		expect(evt.type).toBe("user.created");
		expect(evt.payload.id).toBe("1");
	});

	test("in-memory bus delivers to subscriber", async () => {
		const bus = createInMemoryEventBus();
		const seen: string[] = [];
		bus.subscribe("users", (e) => {
			seen.push(e.type);
		});
		bus.publish("users", {
			id: "1",
			type: "user.created",
			payload: {},
			occurredAt: Date.now(),
		});
		expect(seen).toEqual(["user.created"]);
	});

	test("outbox drain marks published", () => {
		const outbox = new Outbox();
		outbox.add("orders", {
			id: "e1",
			type: "order.placed",
			payload: { n: 1 },
			occurredAt: Date.now(),
		});
		const batch = outbox.drainUnpublished();
		expect(batch).toHaveLength(1);
		expect(outbox.drainUnpublished()).toHaveLength(0);
	});
});
