import { definePluginWithOptionalOptions } from "@ogerjs/core";

export interface IdempotencyRecord {
	status: number;
	headers: Record<string, string>;
	body: string;
	createdAt: number;
}

export interface IdempotencyStore {
	get(key: string): Promise<IdempotencyRecord | null> | IdempotencyRecord | null;
	set(key: string, record: IdempotencyRecord): Promise<void> | void;
}

export interface IdempotencyOptions {
	/** Header name. Default: `idempotency-key`. */
	header?: string;
	/** HTTP methods that require idempotency when header present. */
	methods?: string[];
	/** Record TTL in ms. Default: 24h. */
	ttlMs?: number;
	store?: IdempotencyStore;
}

const DEFAULT_METHODS = ["POST", "PUT", "PATCH"];

export function createMemoryIdempotencyStore(): IdempotencyStore {
	const map = new Map<string, IdempotencyRecord>();
	return {
		get(key) {
			return map.get(key) ?? null;
		},
		set(key, record) {
			map.set(key, record);
		},
	};
}

/** In-flight dedupe: concurrent requests with same key wait for first completion. */
const inflight = new Map<string, Promise<IdempotencyRecord>>();

function isExpired(record: IdempotencyRecord, ttlMs: number, now: number): boolean {
	return now - record.createdAt > ttlMs;
}

async function bodyFromResult(
	result: unknown,
	status: number,
	headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	if (result instanceof Response) {
		const h: Record<string, string> = { ...headers };
		result.headers.forEach((v, k) => {
			h[k.toLowerCase()] = v;
		});
		return {
			status: result.status,
			headers: h,
			body: await result.clone().text(),
		};
	}
	const contentType = headers["content-type"] ?? "application/json";
	if (!headers["content-type"]) headers["content-type"] = contentType;
	const body =
		typeof result === "string" ? result : JSON.stringify(result ?? null);
	return { status, headers, body };
}

export const idempotency = definePluginWithOptionalOptions<IdempotencyOptions>(
	{ name: "@ogerjs/idempotency", scope: "global" },
	(app, options) => {
		const header = (options.header ?? "idempotency-key").toLowerCase();
		const methods = new Set(
			(options.methods ?? DEFAULT_METHODS).map((m) => m.toUpperCase()),
		);
		const ttlMs = options.ttlMs ?? 86_400_000;
		const store = options.store ?? createMemoryIdempotencyStore();

		return app
			.beforeHandle(async (ctx) => {
				if (!methods.has(ctx.request.method)) return;

				const key =
					ctx.headers[header] ?? ctx.request.headers.get(header) ?? undefined;
				if (!key?.trim()) return;

				const idemKey = key.trim();
				ctx.store._idempotencyKey = idemKey;

				const now = Date.now();
				const cached = await store.get(idemKey);
				if (cached && !isExpired(cached, ttlMs, now)) {
					ctx.store._idempotencySkipStore = true;
					return new Response(cached.body, {
						status: cached.status,
						headers: {
							...cached.headers,
							"idempotent-replayed": "true",
						},
					});
				}

				if (inflight.has(idemKey)) {
					ctx.store._idempotencySkipStore = true;
					const record = await inflight.get(idemKey)!;
					return new Response(record.body, {
						status: record.status,
						headers: {
							...record.headers,
							"idempotent-replayed": "true",
						},
					});
				}

				let resolveInflight!: (record: IdempotencyRecord) => void;
				const inflightPromise = new Promise<IdempotencyRecord>((resolve) => {
					resolveInflight = resolve;
				});
				inflight.set(idemKey, inflightPromise);
				ctx.store._idempotencyResolve = resolveInflight;
			})
			.mapResponse(async (ctx) => {
				if (ctx.store._idempotencySkipStore) return;
				const idemKey = ctx.store._idempotencyKey as string | undefined;
				const resolveInflight = ctx.store._idempotencyResolve as
					| ((record: IdempotencyRecord) => void)
					| undefined;
				if (!idemKey || !resolveInflight) return;

				const pending = ctx.pendingResult;
				try {
					const status =
						pending instanceof Response
							? pending.status
							: (ctx.set.status ?? 200);
					const headers = { ...(ctx.set.headers ?? {}) };
					const serialized = await bodyFromResult(pending, status, headers);
					const record: IdempotencyRecord = {
						...serialized,
						createdAt: Date.now(),
					};
					await store.set(idemKey, record);
					resolveInflight(record);
				} finally {
					inflight.delete(idemKey);
				}
			});
	},
	{},
	(options) => options.header ?? "idempotency-key",
);
