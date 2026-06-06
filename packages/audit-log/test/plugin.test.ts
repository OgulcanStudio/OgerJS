import { describe, expect, test } from "bun:test";
import { Oger } from "@ogerjs/core";
import { requestId } from "@ogerjs/request-id";
import type { AuditRecord } from "../src/index";
import { auditLog } from "../src/index";

describe("@ogerjs/audit-log", () => {
	test("records redacted audit events", async () => {
		const events: AuditRecord[] = [];
		const app = new Oger()
			.use(requestId())
			.use(auditLog({ sink: (e) => events.push(e) }))
			.post("/login", (ctx) => {
				ctx.audit({
					type: "auth",
					action: "user.login",
					success: true,
					subject: "alice",
					metadata: { password: "secret123" },
				});
				return { ok: true };
			});

		const res = await app.inject({
			method: "POST",
			path: "/login",
			headers: { "x-request-id": "req-1" },
		});
		expect(res.status).toBe(200);
		expect(events).toHaveLength(1);
		expect(events[0]?.action).toBe("user.login");
		expect(events[0]?.requestId).toBe("req-1");
		expect(events[0]?.metadata?.password).toBe("[REDACTED]");
	});
});
