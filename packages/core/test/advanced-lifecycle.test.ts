import { describe, expect, test } from "bun:test";
import { Oger } from "../src";

describe("advanced lifecycle", () => {
	test("onStop runs when stop() is called", async () => {
		let stopped = false;
		const app = new Oger()
			.get("/", () => "ok")
			.onStop(() => {
				stopped = true;
			});
		app.listen(0);
		app.stop();
		expect(stopped).toBe(true);
	});

	test("onResponse alias fires after handler", async () => {
		let seen = false;
		const app = new Oger()
			.get("/", () => "ok")
			.onResponse(() => {
				seen = true;
			});
		await app.inject("/");
		expect(seen).toBe(true);
	});

	test("onStart runs after listen()", () => {
		let started = false;
		const app = new Oger()
			.get("/", () => "ok")
			.onStart(() => {
				started = true;
			});
		app.listen(0);
		expect(started).toBe(true);
		app.stop();
	});

	test("route meta stores permissions and rateLimit", () => {
		const app = new Oger().get("/", () => "ok", {
			meta: {
				permissions: ["items:read"],
				auth: true,
				rateLimit: { max: 10, windowMs: 1000 },
			},
		});
		expect(app.routes[0]?.meta?.permissions).toEqual(["items:read"]);
		expect(app.routes[0]?.meta?.auth).toBe(true);
		expect(app.routes[0]?.meta?.rateLimit).toEqual({ max: 10, windowMs: 1000 });
	});
});
