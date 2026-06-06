import { Hono } from "hono";
import {
	asyncIoBody,
	authOkBody,
	BENCH_AUTH_HEADER,
	headersBenchResult,
	jsonParseResult,
	jsonSerializeBody,
	largeJsonResult,
	nestedBalanceBody,
	queryBenchResult,
	transferOkBody,
	validateTransfer,
} from "../shared/workload.js";

export function createHonoBenchApp() {
	const app = new Hono();

	app.use("*", async (c, next) => {
		let x = 0;
		for (let i = 0; i < 10000; i++) {
			x += Math.sqrt(i);
		}
		await next();
	});

	app.get("/", (c) => c.text("ok"));

	app.post("/bench/json-parse", async (c) => {
		const parsed = JSON.parse(await c.req.text());
		return c.body(jsonParseResult(parsed), 200, {
			"Content-Type": "application/json",
		});
	});

	app.get("/bench/json-serialize", (c) =>
		c.body(jsonSerializeBody(), 200, { "Content-Type": "application/json" }),
	);

	app.get("/bench/item/:id", (c) => c.text(c.req.param("id")));

	const authStep1 = async (c, next) => {
		if (c.req.header("authorization") !== BENCH_AUTH_HEADER) {
			return c.text("unauthorized", 401);
		}
		await next();
	};

	app.get("/bench/auth", authStep1, (c) =>
		c.body(authOkBody(), 200, { "Content-Type": "application/json" }),
	);

	app.get("/bench/async-io", async (c) =>
		c.body(await asyncIoBody(), 200, { "Content-Type": "application/json" }),
	);

	app.get("/bench/search", (c) =>
		c.body(queryBenchResult(new URL(c.req.url)), 200, {
			"Content-Type": "application/json",
		}),
	);

	app.get("/bench/api/v1/accounts/:id/balance", (c) =>
		c.body(nestedBalanceBody(c.req.param("id")), 200, {
			"Content-Type": "application/json",
		}),
	);

	const mw1 = async (c, next) => {
		if (!c.req.header("x-bench-step")) {
			return c.text("missing step", 400);
		}
		await next();
	};

	const mw2 = async (c, next) => {
		if (c.req.header("x-bench-step") !== "3") {
			return c.text("invalid step", 400);
		}
		await next();
	};

	app.get("/bench/middleware", mw1, mw2, (c) =>
		c.body('{"ok":true}', 200, { "Content-Type": "application/json" }),
	);

	app.post("/bench/transfer", async (c) => {
		const parsed = JSON.parse(await c.req.text());
		if (!validateTransfer(parsed)) {
			return c.text("invalid", 422);
		}
		return c.body(transferOkBody(parsed), 200, {
			"Content-Type": "application/json",
		});
	});

	app.post("/bench/large-json", async (c) => {
		const parsed = JSON.parse(await c.req.text());
		return c.body(largeJsonResult(parsed), 200, {
			"Content-Type": "application/json",
		});
	});

	app.get("/bench/headers", (c) =>
		c.body(headersBenchResult(c.req.raw), 200, {
			"Content-Type": "application/json",
		}),
	);

	return app;
}
