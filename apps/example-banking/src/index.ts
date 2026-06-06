import type { AuditRecord } from "@ogerjs/audit-log";
import { auditLog } from "@ogerjs/audit-log";
import { bearer } from "@ogerjs/bearer";
import { Oger, problemDetailsResponse, t } from "@ogerjs/core";
import { cors } from "@ogerjs/cors";
import { health } from "@ogerjs/health";
import { helmet, helmetApiPreset } from "@ogerjs/helmet";
import { idempotency } from "@ogerjs/idempotency";
import { jwt, signJwt, verifyJwt } from "@ogerjs/jwt";
import { logger } from "@ogerjs/logger";
import { rateLimit } from "@ogerjs/rate-limit";
import { requestId } from "@ogerjs/request-id";
import {
	createWebSocketHandlers,
	TopicPubSub,
	type TopicMessage,
} from "@ogerjs/ws";
import { registryToOpenApi } from "./openapi";
import { BankingStore, TransferError } from "./store";

const SECRET =
	process.env.JWT_SECRET ??
	(process.env.NODE_ENV === "production"
		? (() => {
				throw new Error("JWT_SECRET is required in production");
			})()
		: "dev-secret-change-me-16");

const store = new BankingStore();
const auditEvents: AuditRecord[] = [];
const notifications = new TopicPubSub<TopicMessage & { userId?: string }>();

export const wsHandlers = createWebSocketHandlers({
	handlers: {
		open(ws) {
			const userId = (ws.data as { userId?: string }).userId;
			if (!userId) {
				ws.close(4401, "Unauthorized");
				return;
			}
			notifications.subscribe(`user:${userId}`, ws);
			ws.send(JSON.stringify({ type: "connected", userId }));
		},
		message(ws, raw) {
			const text = typeof raw === "string" ? raw : raw.toString();
			if (text === "ping") {
				ws.send("pong");
			}
		},
		close(ws) {
			notifications.unsubscribeAll(ws);
		},
	},
});

function publishBalanceUpdate(userId: string, accountId: string, balanceCents: number) {
	notifications.publish(
		`user:${userId}`,
		JSON.stringify({
			type: "balance.updated",
			accountId,
			balanceCents,
			ts: new Date().toISOString(),
		}),
	);
}

export function createBankingApp() {
	const bankingApp = new Oger()
		.use(requestId())
		.use(logger())
		.use(helmet(helmetApiPreset()))
		.use(cors({ origin: true, credentials: true }))
		.use(rateLimit({ max: 120, windowMs: 60_000 }))
		.use(idempotency())
		.use(auditLog({ sink: (e) => auditEvents.push(e) }))
		.use(bearer())
		.use(jwt({ secret: SECRET, exp: "1h" }))
		.use(health({ livenessPath: "/health/live", readinessPath: "/health/ready" }))
		.post(
			"/auth/login",
			async (ctx) => {
				const { username } = ctx.body as { username: string };
				const token = await signJwt({ sub: username }, SECRET);
				ctx.audit({
					type: "auth",
					action: "user.login",
					success: true,
					subject: username,
				});
				return { token, expiresIn: 3600 };
			},
			{
				body: t.Object({ username: t.String() }),
				meta: {
					tags: ["Auth"],
					summary: "Issue JWT for demo user",
				},
			},
		)
		.get(
			"/accounts",
			(ctx) => {
				const user = (ctx as { jwt?: { sub?: string } }).jwt?.sub;
				return {
					accounts: store
						.listAccounts()
						.filter((a) => a.owner === user || a.owner === "bank"),
				};
			},
			{
				jwt: true,
				meta: {
					tags: ["Accounts"],
					summary: "List accounts for authenticated user",
					security: [{ bearerAuth: [] }],
				},
			},
		)
		.get(
			"/accounts/:id",
			(ctx) => {
				const account = store.getAccount(ctx.params.id);
				if (!account) {
					return problemDetailsResponse({
						title: "Not Found",
						status: 404,
						detail: "Account not found",
						code: "ACCOUNT_NOT_FOUND",
					});
				}
				return { account };
			},
			{
				jwt: true,
				meta: {
					tags: ["Accounts"],
					summary: "Get account balance",
					security: [{ bearerAuth: [] }],
					audit: { action: "account.read" },
				},
			},
		)
		.post(
			"/transfers",
			(ctx) => {
				const body = ctx.body as {
					fromAccountId: string;
					toAccountId: string;
					amountCents: number;
				};
				const user = (ctx as { jwt?: { sub?: string } }).jwt?.sub;
				const idemKey = ctx.headers["idempotency-key"];

				try {
					const transfer = store.transfer({
						...body,
						idempotencyKey: idemKey,
					});
					const from = store.getAccount(transfer.fromAccountId);
					const to = store.getAccount(transfer.toAccountId);
					if (from) publishBalanceUpdate(from.owner, from.id, from.balanceCents);
					if (to) publishBalanceUpdate(to.owner, to.id, to.balanceCents);

					ctx.audit({
						type: "data",
						action: "transfer.create",
						success: true,
						subject: user,
						resource: transfer.id,
						metadata: {
							fromAccountId: body.fromAccountId,
							toAccountId: body.toAccountId,
							amountCents: body.amountCents,
						},
					});

					return { transfer };
				} catch (err) {
					if (err instanceof TransferError) {
						ctx.audit({
							type: "data",
							action: "transfer.create",
							success: false,
							subject: user,
							metadata: { code: err.code },
						});
						return problemDetailsResponse({
							title: "Transfer Failed",
							status: 400,
							detail: err.message,
							code: err.code,
						});
					}
					throw err;
				}
			},
			{
				jwt: true,
				body: t.Object({
					fromAccountId: t.String(),
					toAccountId: t.String(),
					amountCents: t.Number(),
				}),
				meta: {
					tags: ["Transfers"],
					summary: "Idempotent account transfer",
					security: [{ bearerAuth: [] }],
					audit: { action: "transfer.create" },
				},
			},
		)
		.get(
			"/openapi.json",
			() =>
				registryToOpenApi(bankingApp.routeRegistry, {
					title: "Banking API",
					version: "0.1.0",
				}),
			{
				meta: { tags: ["Docs"], summary: "OpenAPI route registry export" },
			},
		)
		.get(
			"/ws/notifications",
			async (ctx) => {
				const token =
					ctx.query.token ??
					ctx.headers.authorization?.replace(/^Bearer\s+/i, "");
				if (!token) {
					return problemDetailsResponse({
						title: "Unauthorized",
						status: 401,
						detail: "Missing WebSocket auth token",
						code: "WS_AUTH_REQUIRED",
					});
				}
				const payload = await verifyJwt(token, SECRET);
				if (!payload?.sub) {
					return problemDetailsResponse({
						title: "Unauthorized",
						status: 401,
						detail: "Invalid token",
						code: "WS_AUTH_INVALID",
					});
				}

				const upgraded = ctx.server?.upgrade(ctx.request, {
					data: { userId: String(payload.sub) },
				});
				if (!upgraded) {
					return problemDetailsResponse({
						title: "Upgrade Failed",
						status: 426,
						detail: "WebSocket upgrade not available",
						code: "WS_UPGRADE_FAILED",
					});
				}
				return undefined;
			},
			{
				meta: {
					tags: ["WebSocket"],
					summary: "Real-time balance notifications (auth via ?token= or Bearer)",
				},
			},
		);

	return bankingApp;
}

export const app = createBankingApp();

const port = Number(process.env.PORT ?? 3002);
if (import.meta.main) {
	app.listen({ port, websocket: wsHandlers });
	console.log(`Example banking listening on http://localhost:${port}`);
}

export { auditEvents, notifications, store };
