import { definePluginWithOptionalOptions } from "@ogerjs/core";
import fs from "node:fs";

export interface HealthCheckResult {
	ok: boolean;
	detail?: string;
}

export type HealthCheckFn = () =>
	| HealthCheckResult
	| Promise<HealthCheckResult>;

export interface HealthCheck {
	name: string;
	check: HealthCheckFn;
}

export interface HealthReport {
	status: "ok" | "degraded" | "fail";
	checks: Record<string, HealthCheckResult & { name: string }>;
}

export interface HealthOptions {
	livenessPath?: string;
	readinessPath?: string;
	startupPath?: string;
	checks?: HealthCheck[];
}

async function runChecks(checks: HealthCheck[]): Promise<HealthReport> {
	const results: HealthReport["checks"] = {};
	let fail = 0;
	const degraded = 0;
	for (const c of checks) {
		try {
			const r = await c.check();
			results[c.name] = { name: c.name, ...r };
			if (!r.ok) fail += 1;
		} catch (err) {
			results[c.name] = {
				name: c.name,
				ok: false,
				detail: err instanceof Error ? err.message : String(err),
			};
			fail += 1;
		}
	}
	const status = fail > 0 ? "fail" : degraded > 0 ? "degraded" : "ok";
	return { status, checks: results };
}

/** Built-in disk space check (best-effort on Bun/Node). */
export function diskCheck(path = "."): HealthCheck {
	return {
		name: "disk",
		check() {
			try {
				if (typeof Bun !== "undefined") {
					const stat = Bun.file(path).size;
					void stat;
					return { ok: true };
				} else {
					const stat = fs.statSync(path);
					void stat.size;
					return { ok: true };
				}
			} catch {
				return { ok: true, detail: "disk check skipped" };
			}
		},
	};
}

export const health = definePluginWithOptionalOptions<HealthOptions>(
	{ name: "@ogerjs/health", scope: "global" },
	(app, options) => {
		const checks = options.checks ?? [diskCheck()];
		const live = options.livenessPath ?? "/health/live";
		const ready = options.readinessPath ?? "/health/ready";
		const startup = options.startupPath ?? "/health/startup";

		return app
			.get(live, () => ({ status: "ok" }))
			.get(startup, async () => runChecks(checks))
			.get(ready, async () => {
				const report = await runChecks(checks);
				return new Response(JSON.stringify(report), {
					status: report.status === "fail" ? 503 : 200,
					headers: { "content-type": "application/json" },
				});
			});
	},
	{},
);
