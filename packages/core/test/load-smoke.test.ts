import { describe, expect, test } from "bun:test";
import { Oger, t } from "../src";

describe("burst load smoke", () => {
	test("10k banking-shaped requests complete without errors", async () => {
		const TOTAL = 10_000;
		const CONCURRENCY = 256;
		const okBody = '{"ok":true}';
		const okRes = new Response(okBody, {
			headers: { "content-type": "application/json" },
		});
		(okRes as { _rawBody?: string })._rawBody = okBody;

		const app = new Oger()
			.get("/bench/auth", () => okBody, {
				staticResponse: okRes,
				beforeHandle: ({ request }) => {
					if (request.headers.get("authorization") !== "Bearer bench-token") {
						return new Response("unauthorized", { status: 401 });
					}
				},
			})
			.post(
				"/bench/transfer",
				async (request) => {
					await request.text();
					return okRes;
				},
				{
					staticResponse: okRes,
					body: t.Object({
						fromAccount: t.String(),
						toAccount: t.String(),
						amountCents: t.Number(),
					}),
				},
			);

		const port = 31_500 + Math.floor(Math.random() * 500);
		const server = app.listen({ port, hostname: "127.0.0.1" });

		let ok = 0;
		let fail = 0;
		let idx = 0;
		const start = performance.now();

		async function worker() {
			while (true) {
				const i = idx++;
				if (i >= TOTAL) break;
				const path = i % 2 === 0 ? "/bench/auth" : "/bench/transfer";
				const init: RequestInit =
					path === "/bench/auth"
						? { method: "GET", headers: { authorization: "Bearer bench-token" } }
						: {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({
									fromAccount: "a",
									toAccount: "b",
									amountCents: 100,
								}),
							};
				const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
				if (res.ok) ok++;
				else fail++;
			}
		}

		await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
		server.stop(true);

		const elapsed = (performance.now() - start) / 1000;
		const rps = Math.round(TOTAL / elapsed);
		console.log(`burst: ${TOTAL} req in ${elapsed.toFixed(2)}s (${rps} req/s), fail=${fail}`);

		expect(fail).toBe(0);
		expect(ok).toBe(TOTAL);
		expect(rps).toBeGreaterThan(5_000);
	});
});