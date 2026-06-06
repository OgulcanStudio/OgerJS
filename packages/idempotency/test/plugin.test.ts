import { describe, expect, test } from "bun:test";
import { Oger } from "@ogerjs/core";
import { idempotency } from "../src/index";

describe("@ogerjs/idempotency", () => {
	test("replays cached POST response", async () => {
		let hits = 0;
		const app = new Oger()
			.use(idempotency())
			.post("/pay", () => {
				hits += 1;
				return { ok: true, hits };
			});

		const headers = { "idempotency-key": "pay-001" };
		const first = await app.inject({
			method: "POST",
			path: "/pay",
			headers,
		});
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({ ok: true, hits: 1 });

		const second = await app.inject({
			method: "POST",
			path: "/pay",
			headers,
		});
		expect(second.status).toBe(200);
		expect(second.headers.get("idempotent-replayed")).toBe("true");
		expect(await second.json()).toEqual({ ok: true, hits: 1 });
		expect(hits).toBe(1);
	});

	test("ignores GET without key", async () => {
		const app = new Oger()
			.use(idempotency())
			.get("/items", () => ({ n: 1 }));

		const res = await app.inject("/items");
		expect(res.status).toBe(200);
	});
});
