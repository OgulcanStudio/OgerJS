import { definePluginWithOptionalOptions } from "@ogerjs/core";
import { type RedactOptions, redact, redactLogLine } from "./redact";

export type { RedactOptions } from "./redact";
export { redact, redactLogLine } from "./redact";

export interface LoggerOptions {
	/** Log function. Default: `console.log`. */
	log?: (line: string) => void;
	/** When true (default), redact sensitive fields in structured log payloads. */
	redact?: boolean;
	/** Options passed to `redact()` when logging objects. */
	redactOptions?: RedactOptions;
}

export const logger = definePluginWithOptionalOptions<LoggerOptions>(
	{ name: "@ogerjs/logger", scope: "global" },
	(app, options) => {
		const log = options.log ?? console.log;
		const shouldRedact = options.redact ?? true;

		return app
			.derive(() => ({ _logStart: performance.now() }))
			.onAfterResponse((ctx) => {
				const start = ctx._logStart as number | undefined;
				const ms = start !== undefined ? performance.now() - start : 0;
				const method = ctx.request.method;
				const path = new URL(ctx.request.url).pathname;
				const status = ctx.set.status ?? 200;
				const line = redactLogLine(
					`${method} ${path} ${status} ${ms.toFixed(1)}ms`,
				);
				log(line);
				const payload = ctx.store._logPayload;
				if (payload !== undefined && shouldRedact) {
					log(JSON.stringify(redact(payload, options.redactOptions)));
				}
			});
	},
	{},
);

/** Attach a structured log payload (auto-redacted when logger plugin is active). */
export function logPayload(
	ctx: { store: Record<string, unknown> },
	payload: unknown,
): void {
	ctx.store._logPayload = payload;
}
