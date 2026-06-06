import { clientIp, definePluginWithOptions } from "@ogerjs/core";
import { redact } from "@ogerjs/logger";

export type AuditEventType =
	| "auth"
	| "admin"
	| "data"
	| "permission"
	| "security";

export interface AuditEvent {
	type: AuditEventType;
	action: string;
	success?: boolean;
	subject?: string;
	resource?: string;
	metadata?: Record<string, unknown>;
}

export interface AuditRecord extends AuditEvent {
	ts: string;
	requestId?: string;
	ip?: string;
	method?: string;
	path?: string;
}

export type AuditSink = (record: AuditRecord) => void | Promise<void>;

export interface AuditLogOptions {
	sink: AuditSink;
	/** Trust `x-forwarded-for` for IP. Default: false. */
	trustProxy?: boolean;
}

const SINK_KEY = "_auditSink";
const TRUST_KEY = "_auditTrustProxy";

export interface AuditContext {
	request: Request;
	headers: Record<string, string>;
	requestId?: string;
	store?: Record<string, unknown>;
}

export function audit(ctx: AuditContext, event: AuditEvent): void {
	const sink = ctx.store?.[SINK_KEY] as AuditSink | undefined;
	if (!sink) return;

	const trustProxy = Boolean(ctx.store?.[TRUST_KEY]);
	const url = new URL(ctx.request.url);
	const record: AuditRecord = {
		...event,
		metadata: event.metadata ? redact(event.metadata) : undefined,
		ts: new Date().toISOString(),
		requestId: ctx.requestId,
		ip: clientIp(ctx.request, ctx.headers, { trustProxy }),
		method: ctx.request.method,
		path: url.pathname,
	};

	void sink(record);
}

export const auditLog = definePluginWithOptions<AuditLogOptions>(
	{ name: "@ogerjs/audit-log", scope: "global" },
	(app, options) => {
		const sink = options.sink;
		const trustProxy = options.trustProxy ?? false;

		return app
			.beforeHandle((ctx) => {
				ctx.store[SINK_KEY] = sink;
				ctx.store[TRUST_KEY] = trustProxy;
			})
			.derive((ctx) => ({
				audit: (event: AuditEvent) =>
					audit(
						{
							request: ctx.request,
							headers: ctx.headers,
							requestId: ctx.requestId as string | undefined,
							store: ctx.store,
						},
						event,
					),
			}));
	},
	() => "sink",
);
