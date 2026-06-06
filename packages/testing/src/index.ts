import {
	type Container,
	createTestContainer,
	type Oger,
	type RouteDefinition,
	safeStringify,
} from "@ogerjs/core";

export type { Container, Token } from "@ogerjs/core";
export { createTestContainer } from "@ogerjs/core";

export interface MockServices {
	db?: unknown;
	cache?: unknown;
	mail?: unknown;
	payment?: unknown;
	http?: unknown;
	[key: string]: unknown;
}

export const TOKENS = {
	db: Symbol("mock.db"),
	cache: Symbol("mock.cache"),
	mail: Symbol("mock.mail"),
	payment: Symbol("mock.payment"),
	http: Symbol("mock.http"),
} as const;

/** Register common service mocks for integration tests. */
export function createMockContainer(services: MockServices = {}): Container {
	const c = createTestContainer();
	if (services.db !== undefined) c.register(TOKENS.db, services.db);
	if (services.cache !== undefined) c.register(TOKENS.cache, services.cache);
	if (services.mail !== undefined) c.register(TOKENS.mail, services.mail);
	if (services.payment !== undefined)
		c.register(TOKENS.payment, services.payment);
	if (services.http !== undefined) c.register(TOKENS.http, services.http);
	for (const [key, value] of Object.entries(services)) {
		if (["db", "cache", "mail", "payment", "http"].includes(key)) continue;
		c.register(key, value);
	}
	return c;
}

/** Stable JSON snapshot string for bun:test `expect(...).toMatchSnapshot()`. */
export function snapshotJson(value: unknown): string {
	return `${safeStringify(value, { nullifyUndefined: true })}\n`;
}

export interface ContractTestCase {
	method: string;
	path: string;
	description: string;
}

/** Generate minimal contract test descriptors from registered routes. */
export function generateContractTests(
	routes: RouteDefinition[],
): ContractTestCase[] {
	return routes
		.filter((r) => r.method !== "ALL")
		.map((route) => ({
			method: route.method,
			path: route.path,
			description: route.meta?.summary ?? `${route.method} ${route.path}`,
		}));
}

/** Run generated contract smoke tests against an app via `inject()`. */
export async function runContractSmokeTests(
	app: Oger,
	routes: RouteDefinition[],
): Promise<Array<{ case: ContractTestCase; status: number; ok: boolean }>> {
	const cases = generateContractTests(routes);
	const results = [];
	for (const c of cases) {
		if (c.method !== "GET" && c.method !== "HEAD") continue;
		const path = c.path.replace(/:([a-zA-Z_]+)/g, "test");
		const res = await app.inject({ method: c.method, path });
		results.push({ case: c, status: res.status, ok: res.status < 500 });
	}
	return results;
}

export interface BenchResult {
	path: string;
	method: string;
	iterations: number;
	totalMs: number;
	avgMs: number;
	minMs: number;
	maxMs: number;
}

/** In-process route benchmark (no network port). */
export async function benchRoute(
	app: Oger,
	path: string,
	options: { method?: string; iterations?: number; body?: unknown } = {},
): Promise<BenchResult> {
	const method = options.method ?? "GET";
	const iterations = options.iterations ?? 100;
	const times: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await app.inject({ method, path, body: options.body });
		times.push(performance.now() - start);
	}
	const totalMs = times.reduce((a, b) => a + b, 0);
	return {
		path,
		method,
		iterations,
		totalMs,
		avgMs: totalMs / iterations,
		minMs: Math.min(...times),
		maxMs: Math.max(...times),
	};
}


export * from "./plugin-contract";
export * from "./plugin-registry";
