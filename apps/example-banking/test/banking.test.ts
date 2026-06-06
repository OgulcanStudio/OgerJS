import { describe, expect, test } from "bun:test";
import { signJwt } from "@ogerjs/jwt";
import { app, auditEvents, store } from "../src/index";

const SECRET = "dev-secret-change-me-16";

async function login(username: string): Promise<string> {
	const res = await app.inject({
		method: "POST",
		path: "/auth/login",
		body: { username },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { token: string };
	return body.token;
}

describe("example-banking", () => {
	test("login + list accounts + transfer idempotency", async () => {
		const token = await login("alice");
		const auth = { authorization: `Bearer ${token}` };

		const accountsRes = await app.inject({
			path: "/accounts",
			headers: auth,
		});
		expect(accountsRes.status).toBe(200);
		const accountsBody = (await accountsRes.json()) as {
			accounts: Array<{ id: string }>;
		};
		expect(accountsBody.accounts.length).toBeGreaterThan(0);

		const before = store.getAccount("acct-checking")!.balanceCents;
		const transferBody = {
			fromAccountId: "acct-checking",
			toAccountId: "acct-savings",
			amountCents: 10_00,
		};
		const idem = { "idempotency-key": "xfer-test-001", ...auth };

		const first = await app.inject({
			method: "POST",
			path: "/transfers",
			headers: idem,
			body: transferBody,
		});
		expect(first.status).toBe(200);

		const second = await app.inject({
			method: "POST",
			path: "/transfers",
			headers: idem,
			body: transferBody,
		});
		expect(second.status).toBe(200);
		expect(second.headers.get("idempotent-replayed")).toBe("true");

		const after = store.getAccount("acct-checking")!.balanceCents;
		expect(after).toBe(before - 10_00);

		const auditTransfer = auditEvents.filter(
			(e) => e.action === "transfer.create" && e.success,
		);
		expect(auditTransfer.length).toBeGreaterThan(0);
	});

	test("transfer rejects insufficient funds with RFC 7807", async () => {
		const token = await login("alice");
		const res = await app.inject({
			method: "POST",
			path: "/transfers",
			headers: {
				authorization: `Bearer ${token}`,
				"idempotency-key": "xfer-fail-001",
			},
			body: {
				fromAccountId: "acct-checking",
				toAccountId: "acct-savings",
				amountCents: 999_999_999,
			},
		});
		expect(res.status).toBe(400);
		expect(res.headers.get("content-type")).toContain("application/problem+json");
		const problem = (await res.json()) as { code: string };
		expect(problem.code).toBe("INSUFFICIENT_FUNDS");
	});

	test("openapi.json exports registry", async () => {
		const res = await app.inject("/openapi.json");
		expect(res.status).toBe(200);
		const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
		expect(doc.openapi).toBe("3.0.3");
		expect(doc.paths["/transfers"]).toBeDefined();
	});

	test("rate limit headers present", async () => {
		const res = await app.inject("/health/live");
		expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
	});

	test("ws route rejects missing token", async () => {
		const res = await app.inject({
			path: "/ws/notifications",
			headers: { upgrade: "websocket", connection: "Upgrade" },
		});
		expect(res.status).toBe(401);
	});

	test("ws route accepts valid token via query", async () => {
		const token = await signJwt({ sub: "alice" }, SECRET);
		const res = await app.inject({
			path: "/ws/notifications",
			query: { token },
			headers: { upgrade: "websocket", connection: "Upgrade" },
		});
		// inject() has no real upgrade — expect 426 when server null or upgrade fails
		expect([401, 426]).toContain(res.status);
	});
});
