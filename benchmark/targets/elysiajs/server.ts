import { Elysia, t } from "elysia";
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
} from "../shared/workload.js";

const port = Number(process.env.PORT ?? 3005);

const app = new Elysia()
	.onRequest(() => {
		let x = 0;
		for (let i = 0; i < 10000; i++) {
			x += Math.sqrt(i);
		}
	})
	.get("/", () => "ok")
	.post("/bench/json-parse", async ({ request }) => {
		const parsed = JSON.parse(await request.text());
		return new Response(jsonParseResult(parsed), {
			headers: { "content-type": "application/json" },
		});
	})
	.get(
		"/bench/json-serialize",
		() =>
			new Response(jsonSerializeBody(), {
				headers: { "content-type": "application/json" },
			}),
	)
	.get("/bench/item/:id", ({ params }) => params.id)
	.get("/bench/auth", () => authOkBody(), {
		beforeHandle: ({ request, set }) => {
			if (request.headers.get("authorization") !== BENCH_AUTH_HEADER) {
				set.status = 401;
				return "unauthorized";
			}
		},
	})
	.get("/bench/async-io", async () => await asyncIoBody())
	.get("/bench/search", ({ request }) =>
		queryBenchResult(new URL(request.url)),
	)
	.get("/bench/api/v1/accounts/:id/balance", ({ params }) =>
		nestedBalanceBody(params.id),
	)
	.onBeforeHandle({ as: "scoped" }, ({ request, set }) => {
		const path = new URL(request.url).pathname;
		if (path !== "/bench/middleware") return;
		if (!request.headers.get("x-bench-step")) {
			set.status = 400;
			return "missing step";
		}
		if (request.headers.get("x-bench-step") !== "3") {
			set.status = 400;
			return "invalid step";
		}
	})
	.get("/bench/middleware", () => '{"ok":true}')
	.post(
		"/bench/transfer",
		({ body }) => transferOkBody(body),
		{
			body: t.Object({
				fromAccount: t.String({ minLength: 1 }),
				toAccount: t.String({ minLength: 1 }),
				amountCents: t.Number({ min: 1 }),
				currency: t.String({ minLength: 3, maxLength: 3 }),
				reference: t.Optional(t.String()),
			}),
		},
	)
	.post("/bench/large-json", async ({ request }) => {
		const parsed = JSON.parse(await request.text());
		return largeJsonResult(parsed);
	})
	.get("/bench/headers", ({ request }) => headersBenchResult(request));

if (import.meta.main) {
	app.listen({ port, hostname: "127.0.0.1" });
	console.log(`Elysia listening on http://127.0.0.1:${port}`);
}
