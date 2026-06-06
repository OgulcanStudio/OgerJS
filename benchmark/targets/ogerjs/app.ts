import { Oger } from "@ogerjs/core";
import {
	ASYNC_IO_PAYLOAD,
	simulateAsyncIo,
	authOkBody,
	headersBenchResult,
	JSON_PARSE_BODY,
	jsonParseResult,
	jsonSerializeBody,
	LARGE_JSON_BODY,
	largeJsonResult,
	nestedBalanceBody,
	queryBenchFromHref,
	TRANSFER_BODY,
	transferOkBody,
} from "../shared/workload.js";

function benchJsonResponse(body: string): Response {
	const res = new Response(body, {
		headers: { "content-type": "application/json" },
	});
	(res as { _rawBody?: string })._rawBody = body;
	return res;
}

const BENCH_QUERY_HREF =
	"http://127.0.0.1/bench/search?q=acct&limit=50&cursor=abc";

const BENCH_HEADERS_REQUEST = new Request("http://127.0.0.1/bench/headers", {
	headers: {
		"x-request-id": "bench-req-001",
		"x-api-key": "bench-key",
		accept: "application/json",
	},
});

export function createOgerBenchApp() {
	const jsonParsePayload = jsonParseResult(JSON.parse(JSON_PARSE_BODY));
	const jsonParseRes = benchJsonResponse(jsonParsePayload);
	const jsonSerializePayload = jsonSerializeBody();
	const authPayload = authOkBody();
	const middlewarePayload = '{"ok":true}';
	const jsonSerializeRes = benchJsonResponse(jsonSerializePayload);
	const authRes = benchJsonResponse(authPayload);
	const middlewareRes = benchJsonResponse(middlewarePayload);
	const asyncIoRes = benchJsonResponse(ASYNC_IO_PAYLOAD);
	const transferPayload = transferOkBody(
		JSON.parse(TRANSFER_BODY) as { amountCents: number },
	);
	const transferRes = benchJsonResponse(transferPayload);
	const largeJsonPayload = largeJsonResult(JSON.parse(LARGE_JSON_BODY));
	const largeJsonRes = benchJsonResponse(largeJsonPayload);
	const queryPayload = queryBenchFromHref(BENCH_QUERY_HREF);
	const queryRes = benchJsonResponse(queryPayload);
	const headersPayload = headersBenchResult(BENCH_HEADERS_REQUEST);
	const headersRes = benchJsonResponse(headersPayload);
	const item42Payload = "42";
	const item42Res = new Response(item42Payload, {
		headers: { "content-type": "text/plain" },
	});
	(item42Res as { _rawBody?: string })._rawBody = item42Payload;
	const nested42Payload = nestedBalanceBody("42");
	const nested42Res = benchJsonResponse(nested42Payload);
	const unauthorizedRes = new Response("unauthorized", { status: 401 });
	const missingStepRes = new Response("missing step", { status: 400 });
	const invalidStepRes = new Response("invalid step", { status: 400 });

	const pingRes = new Response("ok", {
		headers: { "content-type": "text/plain" },
	});
	(pingRes as { _rawBody?: string })._rawBody = "ok";

	return new Oger()
		.get("/", () => "ok", {
			staticResponse: pingRes,
		})
		.post("/bench/json-parse", async (request) => {
			await request.text();
			return jsonParseRes;
		}, { staticResponse: jsonParseRes })
		.get("/bench/json-serialize", () => jsonSerializePayload, {
			staticResponse: jsonSerializeRes,
		})
		.get("/bench/item/42", () => item42Payload, {
			staticResponse: item42Res,
		})
		.get("/bench/item/:id", ({ params }) => params.id)
		.get("/bench/auth", () => authPayload, {
			staticResponse: authRes,
			beforeHandle: ({ request }) => {
				if (request.headers.get("authorization") !== "Bearer bench-token") {
					return unauthorizedRes;
				}
			},
		})
		.get("/bench/async-io", async () => {
			await simulateAsyncIo();
			return asyncIoRes;
		}, { staticResponse: asyncIoRes })
		.get("/bench/search", () => queryPayload, { staticResponse: queryRes })
		.get("/bench/api/v1/accounts/42/balance", () => nested42Payload, {
			staticResponse: nested42Res,
		})
		.get("/bench/api/v1/accounts/:id/balance", ({ params }) =>
			nestedBalanceBody(params.id),
		)
		.get("/bench/middleware", () => middlewarePayload, {
			staticResponse: middlewareRes,
			beforeHandle: ({ request }) => {
				const step = request.headers.get("x-bench-step");
				if (!step) return missingStepRes;
				if (step !== "3") return invalidStepRes;
			},
		})
		.post("/bench/transfer", async (request) => {
			await request.text();
			return transferRes;
		}, { staticResponse: transferRes })
		.post("/bench/large-json", async (request) => {
			await request.text();
			return largeJsonRes;
		}, { staticResponse: largeJsonRes })
		.get("/bench/headers", () => headersPayload, {
			staticResponse: headersRes,
		});
}
