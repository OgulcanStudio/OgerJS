import { describe, expect, test } from "bun:test";
import { Oger } from "@ogerjs/core";
import { requestId } from "../src/index";

describe("@ogerjs/request-id", () => {
	test("propagates incoming header", async () => {
		const app = new Oger()
			.use(requestId())
			.get("/ping", (ctx) => ({ id: ctx.requestId }));

		const res = await app.inject({
			path: "/ping",
			headers: { "x-request-id": "trace-abc" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("x-request-id")).toBe("trace-abc");
		expect(await res.json()).toEqual({ id: "trace-abc" });
	});

	test("generates id when header missing", async () => {
		const app = new Oger()
			.use(requestId())
			.get("/ping", (ctx) => ({ id: ctx.requestId }));

		const res = await app.inject("/ping");
		const generated = res.headers.get("x-request-id");
		expect(generated).toBeTruthy();
		expect((await res.json()).id).toBe(generated);
	});
});
