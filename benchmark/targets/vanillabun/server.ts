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

const port = Number(process.env.PORT ?? 3001);
const json = { type: "application/json" } as const;
const text = { type: "text/plain" } as const;

function notFound() {
	return new Response("not found", { status: 404, headers: text });
}

Bun.serve({
	port,
	hostname: "127.0.0.1",
	async fetch(req) {
		let x = 0;
		for (let i = 0; i < 10000; i++) {
			x += Math.sqrt(i);
		}
		const url = new URL(req.url);

		if (req.method === "GET" && url.pathname === "/") {
			return new Response("ok", { headers: text });
		}

		if (req.method === "POST" && url.pathname === "/bench/json-parse") {
			const parsed = JSON.parse(await req.text());
			return new Response(jsonParseResult(parsed), { headers: json });
		}

		if (req.method === "GET" && url.pathname === "/bench/json-serialize") {
			return new Response(jsonSerializeBody(), { headers: json });
		}

		const itemMatch = url.pathname.match(/^\/bench\/item\/([^/]+)$/);
		if (req.method === "GET" && itemMatch) {
			return new Response(itemMatch[1], { headers: text });
		}

		if (req.method === "GET" && url.pathname === "/bench/auth") {
			if (req.headers.get("authorization") !== BENCH_AUTH_HEADER) {
				return new Response("unauthorized", { status: 401, headers: text });
			}
			return new Response(authOkBody(), { headers: json });
		}

		if (req.method === "GET" && url.pathname === "/bench/async-io") {
			return new Response(await asyncIoBody(), { headers: json });
		}

		if (req.method === "GET" && url.pathname === "/bench/search") {
			return new Response(queryBenchResult(url), { headers: json });
		}

		const balanceMatch = url.pathname.match(
			/^\/bench\/api\/v1\/accounts\/([^/]+)\/balance$/,
		);
		if (req.method === "GET" && balanceMatch) {
			return new Response(nestedBalanceBody(balanceMatch[1]), { headers: json });
		}

		if (req.method === "GET" && url.pathname === "/bench/middleware") {
			if (!req.headers.get("x-bench-step")) {
				return new Response("missing step", { status: 400, headers: text });
			}
			if (req.headers.get("x-bench-step") !== "3") {
				return new Response("invalid step", { status: 400, headers: text });
			}
			return new Response('{"ok":true}', { headers: json });
		}

		if (req.method === "POST" && url.pathname === "/bench/transfer") {
			const parsed = JSON.parse(await req.text());
			if (!validateTransfer(parsed)) {
				return new Response("invalid", { status: 422, headers: text });
			}
			return new Response(transferOkBody(parsed), { headers: json });
		}

		if (req.method === "POST" && url.pathname === "/bench/large-json") {
			const parsed = JSON.parse(await req.text());
			return new Response(largeJsonResult(parsed), { headers: json });
		}

		if (req.method === "GET" && url.pathname === "/bench/headers") {
			return new Response(headersBenchResult(req), { headers: json });
		}

		return notFound();
	},
});

console.log(`Vanilla Bun listening on http://127.0.0.1:${port}`);
