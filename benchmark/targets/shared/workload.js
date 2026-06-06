/** Shared JSON payloads and native parse/serialize workload (no third-party JSON libs). */

export const BENCH_AUTH_HEADER = "Bearer bench-token";

export const ASYNC_IO_DELAY_MS = 1;

export const JSON_PARSE_BODY = JSON.stringify({
	items: Array.from({ length: 32 }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		tags: ["bench", "json-parse"],
	})),
	meta: { source: "benchmark", version: 1 },
});

export const SERIALIZE_SOURCE = {
	items: Array.from({ length: 24 }, (_, i) => ({
		id: i,
		label: `row-${i}`,
		active: i % 2 === 0,
	})),
	meta: { source: "benchmark", kind: "serialize" },
};

export const TRANSFER_BODY = JSON.stringify({
	fromAccount: "acc-1001",
	toAccount: "acc-2002",
	amountCents: 50_000,
	currency: "USD",
	reference: "bench-transfer-001",
});

export const LARGE_JSON_BODY = JSON.stringify({
	batchId: "batch-001",
	institution: "bench-bank",
	transactions: Array.from({ length: 64 }, (_, i) => ({
		id: `tx-${i}`,
		accountId: `acc-${(i % 8) + 1}`,
		amountCents: (i + 1) * 100,
		currency: "USD",
		narrative: `payment-${i}`,
	})),
});

/** @param {{ items?: Array<{ id: number }>; meta?: { version?: number } }} parsed */
export function jsonParseResult(parsed) {
	const itemCount = parsed.items?.length ?? 0;
	const version = parsed.meta?.version ?? 0;
	return JSON.stringify({ itemCount, version });
}

export function jsonSerializeBody() {
	const count = SERIALIZE_SOURCE.items.length;
	const checksum = SERIALIZE_SOURCE.items.reduce((sum, row) => sum + row.id, 0);
	return JSON.stringify({
		count,
		checksum,
		source: SERIALIZE_SOURCE.meta.source,
	});
}

export function isBenchAuthorized(authorization) {
	return authorization === BENCH_AUTH_HEADER;
}

export function authOkBody() {
	return JSON.stringify({ authorized: true, scope: "bench" });
}

export async function simulateAsyncIo() {
	const data = new TextEncoder().encode("enterprise-grade-async-io-simulation");
	await crypto.subtle.digest("SHA-256", data);
}

export const ASYNC_IO_PAYLOAD = jsonSerializeBody();

export async function asyncIoBody() {
	await simulateAsyncIo();
	return ASYNC_IO_PAYLOAD;
}

/** @param {URL} url */
export function queryBenchResult(url) {
	return queryBenchFromHref(url.href);
}

/** @param {string} href */
export function queryBenchFromHref(href) {
	const q = href.indexOf("?");
	const search = q === -1 ? "" : href.slice(q + 1).split("#")[0];
	const params = new URLSearchParams(search);
	const limit = Number(params.get("limit") ?? "10");
	const cursor = params.get("cursor") ?? "";
	const qVal = params.get("q") ?? "";
	return JSON.stringify({
		q: qVal,
		limit: Number.isFinite(limit) ? limit : 10,
		cursor,
		count: Math.min(Number.isFinite(limit) ? limit : 10, 50),
	});
}

export function nestedBalanceBody(accountId) {
	return JSON.stringify({
		accountId,
		balanceCents: 1_250_000,
		currency: "USD",
	});
}

function readHeader(request, name) {
	const headers = request?.headers;
	if (!headers) return "";
	if (typeof headers.get === "function") {
		return headers.get(name) ?? "";
	}
	const key = Object.keys(headers).find(
		(entry) => entry.toLowerCase() === name.toLowerCase(),
	);
	if (!key) return "";
	const value = headers[key];
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function headersBenchResult(request) {
	const requestId = readHeader(request, "x-request-id");
	const apiKey = readHeader(request, "x-api-key");
	const accept = readHeader(request, "accept");
	return JSON.stringify({
		requestId,
		apiKeyPresent: apiKey.length > 0,
		accept,
	});
}

/** @param {unknown} parsed */
export function validateTransfer(parsed) {
	if (!parsed || typeof parsed !== "object") return false;
	const row = /** @type {Record<string, unknown>} */ (parsed);
	return (
		typeof row.fromAccount === "string" &&
		row.fromAccount.length > 0 &&
		typeof row.toAccount === "string" &&
		row.toAccount.length > 0 &&
		typeof row.amountCents === "number" &&
		row.amountCents > 0 &&
		typeof row.currency === "string" &&
		row.currency.length === 3
	);
}

/** @param {{ amountCents: number }} parsed */
export function transferOkBody(parsed) {
	return JSON.stringify({ accepted: true, amountCents: parsed.amountCents });
}

/** @param {{ batchId?: string; transactions?: Array<{ id: string }> }} parsed */
export function largeJsonResult(parsed) {
	const count = parsed.transactions?.length ?? 0;
	return JSON.stringify({
		batchId: parsed.batchId ?? "unknown",
		processed: count,
	});
}
