import express from "express";
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

const port = Number(process.env.PORT ?? 3006);
const app = express();

app.get("/", (req, res) => {
	res.setHeader("content-type", "text/plain");
	res.send("ok");
});

app.post("/bench/json-parse", express.text({ type: "*/*" }), (req, res) => {
	const parsed = JSON.parse(req.body);
	res.setHeader("content-type", "application/json");
	res.send(jsonParseResult(parsed));
});

app.get("/bench/json-serialize", (req, res) => {
	res.setHeader("content-type", "application/json");
	res.send(jsonSerializeBody());
});

app.get("/bench/item/:id", (req, res) => {
	res.setHeader("content-type", "text/plain");
	res.send(req.params.id);
});

const authStep = (req, res, next) => {
	if (req.headers.authorization !== BENCH_AUTH_HEADER) {
		res.setHeader("content-type", "text/plain");
		res.status(401).send("unauthorized");
		return;
	}
	next();
};

app.get("/bench/auth", authStep, (req, res) => {
	res.setHeader("content-type", "application/json");
	res.send(authOkBody());
});

app.get("/bench/async-io", async (req, res) => {
	const body = await asyncIoBody();
	res.setHeader("content-type", "application/json");
	res.send(body);
});

app.get("/bench/search", (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
	res.setHeader("content-type", "application/json");
	res.send(queryBenchResult(url));
});

app.get("/bench/api/v1/accounts/:id/balance", (req, res) => {
	res.setHeader("content-type", "application/json");
	res.send(nestedBalanceBody(req.params.id));
});

const mw1 = (req, res, next) => {
	if (!req.headers["x-bench-step"]) {
		res.status(400).send("missing step");
		return;
	}
	next();
};

const mw2 = (req, res, next) => {
	if (req.headers["x-bench-step"] !== "3") {
		res.status(400).send("invalid step");
		return;
	}
	next();
};

app.get("/bench/middleware", mw1, mw2, (req, res) => {
	res.setHeader("content-type", "application/json");
	res.send('{"ok":true}');
});

app.post("/bench/transfer", express.text({ type: "*/*" }), (req, res) => {
	const parsed = JSON.parse(req.body);
	if (!validateTransfer(parsed)) {
		res.status(422).send("invalid");
		return;
	}
	res.setHeader("content-type", "application/json");
	res.send(transferOkBody(parsed));
});

app.post("/bench/large-json", express.text({ type: "*/*" }), (req, res) => {
	const parsed = JSON.parse(req.body);
	res.setHeader("content-type", "application/json");
	res.send(largeJsonResult(parsed));
});

app.get("/bench/headers", (req, res) => {
	res.setHeader("content-type", "application/json");
	res.send(headersBenchResult(req));
});

app.listen(port, "127.0.0.1", () => {
	console.log(`Express listening on http://127.0.0.1:${port}`);
});
