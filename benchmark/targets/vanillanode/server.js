import http from "node:http";
import { URL } from "node:url";
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

const port = Number(process.env.PORT ?? 3002);

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

const server = http.createServer(async (req, res) => {
	const url = new URL(
		req.url ?? "/",
		`http://${req.headers.host ?? "127.0.0.1"}`,
	);

	const send = (status, body, type) => {
		res.writeHead(status, { "content-type": type });
		res.end(body);
	};

	if (req.method === "GET" && url.pathname === "/") {
		send(200, "ok", "text/plain");
		return;
	}

	if (req.method === "POST" && url.pathname === "/bench/json-parse") {
		const parsed = JSON.parse(await readBody(req));
		send(200, jsonParseResult(parsed), "application/json");
		return;
	}

	if (req.method === "GET" && url.pathname === "/bench/json-serialize") {
		send(200, jsonSerializeBody(), "application/json");
		return;
	}

	const paramMatch = url.pathname.match(/^\/bench\/item\/([^/]+)$/);
	if (req.method === "GET" && paramMatch) {
		send(200, paramMatch[1], "text/plain");
		return;
	}

	if (req.method === "GET" && url.pathname === "/bench/auth") {
		if (req.headers.authorization !== BENCH_AUTH_HEADER) {
			send(401, "unauthorized", "text/plain");
			return;
		}
		send(200, authOkBody(), "application/json");
		return;
	}

	if (req.method === "GET" && url.pathname === "/bench/async-io") {
		send(200, await asyncIoBody(), "application/json");
		return;
	}

	if (req.method === "GET" && url.pathname === "/bench/search") {
		send(200, queryBenchResult(url), "application/json");
		return;
	}

	const balanceMatch = url.pathname.match(
		/^\/bench\/api\/v1\/accounts\/([^/]+)\/balance$/,
	);
	if (req.method === "GET" && balanceMatch) {
		send(200, nestedBalanceBody(balanceMatch[1]), "application/json");
		return;
	}

	if (req.method === "GET" && url.pathname === "/bench/middleware") {
		if (!req.headers["x-bench-step"]) {
			send(400, "missing step", "text/plain");
			return;
		}
		if (req.headers["x-bench-step"] !== "3") {
			send(400, "invalid step", "text/plain");
			return;
		}
		send(200, '{"ok":true}', "application/json");
		return;
	}

	if (req.method === "POST" && url.pathname === "/bench/transfer") {
		const parsed = JSON.parse(await readBody(req));
		if (!validateTransfer(parsed)) {
			send(422, "invalid", "text/plain");
			return;
		}
		send(200, transferOkBody(parsed), "application/json");
		return;
	}

	if (req.method === "POST" && url.pathname === "/bench/large-json") {
		const parsed = JSON.parse(await readBody(req));
		send(200, largeJsonResult(parsed), "application/json");
		return;
	}

	if (req.method === "GET" && url.pathname === "/bench/headers") {
		send(200, headersBenchResult(req), "application/json");
		return;
	}

	send(404, "not found", "text/plain");
});

server.listen(port, "127.0.0.1", () => {
	console.log(`Vanilla Node listening on http://127.0.0.1:${port}`);
});
