import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeMode, Oger, setRuntimeMode, t } from "@ogerjs/core";

const staticSafeDir = mkdtempSync(join(tmpdir(), "oger-static-safe-"));
mkdirSync(join(staticSafeDir, "nested"));
writeFileSync(join(staticSafeDir, "nested", "secret.txt"), "secret");

import { apiKey } from "@ogerjs/api-key";
import { basicAuth } from "@ogerjs/basic-auth";
import { bearer } from "@ogerjs/bearer";
import { bodyLimit } from "@ogerjs/body-limit";
import { compat } from "@ogerjs/compat";
import { compress } from "@ogerjs/compress";
import { cookie } from "@ogerjs/cookie";
import { cors } from "@ogerjs/cors";
import { csrf } from "@ogerjs/csrf";
import { etag } from "@ogerjs/etag";
import { health } from "@ogerjs/health";
import {
	helmet,
	helmetAdminPreset,
	helmetApiPreset,
	helmetDashboardPreset,
	helmetPublicWebsitePreset,
} from "@ogerjs/helmet";
import { json, jsonResponse, readJsonBody } from "@ogerjs/json";
import { jwt, signJwt, verifyJwt } from "@ogerjs/jwt";
import { logger } from "@ogerjs/logger";
import { AdaptiveLimiter, rateLimit } from "@ogerjs/rate-limit";
import { createSseResponse, sse } from "@ogerjs/sse";
import { staticPlugin } from "@ogerjs/static";

import type { PluginTestCase } from "../src/plugin-contract";

export const PLUGIN_TEST_CASES: Record<
	string,
	{ factory: any; smokePath?: string; cases?: PluginTestCase[] }
> = {
	"@ogerjs/api-key": {
		factory: apiKey,
		cases: [
			{
				name: "macro rejects missing key",
				options: { validate: ["secret-key-123456"] },
				setupAfter: (app) => app.get("/api", () => "ok", { apiKey: true }),
				request: { path: "/api" },
				expect: { status: 401 },
			},
			{
				name: "macro accepts valid header key",
				options: { validate: ["secret-key-123456"] },
				setupAfter: (app) => app.get("/api", () => "ok", { apiKey: true }),
				request: {
					path: "/api",
					headers: { "x-api-key": "secret-key-123456" },
				},
				expect: { status: 200 },
			},
			{
				name: "custom validate function",
				options: { validate: (k: string) => k === "custom-valid-key" },
				setupAfter: (app) => app.get("/api", () => "ok", { apiKey: true }),
				request: { path: "/api", headers: { "x-api-key": "custom-valid-key" } },
				expect: { status: 200 },
			},
		],
	},
	"@ogerjs/basic-auth": {
		factory: basicAuth,
		cases: [
			{
				name: "rejects missing credentials",
				options: { username: "u", password: "p" },
				setupAfter: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				expect: { status: 401, headers: { "www-authenticate": /Basic/ } },
			},
			{
				name: "accepts valid Basic credentials",
				options: { username: "u", password: "p" },
				setupAfter: (app) => app.get("/", () => "ok"),
				request: {
					path: "/",
					headers: { authorization: `Basic ${btoa("u:p")}` },
				},
				expect: { status: 200, body: "ok" },
			},
		],
	},
	"@ogerjs/bearer": {
		factory: bearer,
		cases: [
			{
				name: "derive exposes bearer token from Authorization header",
				setupAfter: (app) =>
					app.get("/token", (ctx) => ({ token: (ctx as any).bearer })),
				request: {
					path: "/token",
					headers: { authorization: "Bearer secret" },
				},
				expect: { status: 200, body: { token: "secret" } },
			},
			{
				name: "derive ignores non-Bearer authorization",
				setupAfter: (app) =>
					app.get("/token", (ctx) => ({ token: (ctx as any).bearer })),
				request: { path: "/token", headers: { authorization: "Basic x" } },
				expect: { status: 200, body: {} },
			},
			{
				name: "macro bearer rejects missing token",
				setupAfter: (app) =>
					app.get("/secure", (ctx) => (ctx as any).token, { bearer: true }),
				request: { path: "/secure" },
				expect: { status: 401 },
			},
			{
				name: "macro bearer accepts valid token",
				setupAfter: (app) =>
					app.get("/secure", (ctx) => (ctx as any).token, { bearer: true }),
				request: { path: "/secure", headers: { authorization: "Bearer ok" } },
				expect: { status: 200, body: "ok" },
			},
		],
	},
	"@ogerjs/body-limit": {
		factory: bodyLimit,
		cases: [
			{
				name: "rejects Content-Length above max",
				options: { maxSize: 100 },
				setup: (app) => app.post("/", () => "ok"),
				request: {
					method: "POST",
					path: "/",
					headers: { "content-length": "500" },
				},
				expect: { status: 413 },
			},
			{
				name: "allows requests within limit",
				options: { maxSize: 1000 },
				setup: (app) => app.post("/", () => "ok"),
				request: {
					method: "POST",
					path: "/",
					headers: { "content-length": "10" },
				},
				expect: { status: 200 },
			},
		],
	},
	"@ogerjs/compat": {
		factory: compat,
		cases: [
			{
				name: "sets edge mode",
				options: { mode: "edge" },
				assert: () => {
					expect(getRuntimeMode()).toBe("edge");
					setRuntimeMode("default");
				},
			},
		],
	},
	"@ogerjs/compress": {
		factory: compress,
		cases: [
			{
				name: "gzip-encodes large text responses when Accept-Encoding allows",
				options: { threshold: 512 },
				setup: (app) => app.get("/", () => "x".repeat(2000)),
				request: { path: "/", headers: { "accept-encoding": "gzip" } },
				assert: async (res) => {
					expect(res.headers.get("content-encoding")).toBe("gzip");
					const body = await Bun.gunzipSync(
						new Uint8Array(await res.arrayBuffer()),
					);
					expect(new TextDecoder().decode(body)).toBe("x".repeat(2000));
				},
			},
			{
				name: "skips compression below threshold",
				options: { threshold: 10_000 },
				setup: (app) => app.get("/", () => "small"),
				request: { path: "/", headers: { "accept-encoding": "gzip" } },
				expect: {
					status: 200,
					headers: { "content-encoding": null },
					body: "small",
				},
			},
		],
	},
	"@ogerjs/cookie": {
		factory: cookie,
		cases: [
			{
				name: "parses cookie header on request",
				setup: (app) => app.get("/c", (ctx) => ctx.cookie.session?.value),
				request: { path: "/c", headers: { cookie: "session=abc123" } },
				expect: { status: 200, body: "abc123" },
			},
			{
				name: "parseCookies handles empty and malformed parts",
				setup: (app) => app.get("/c", (ctx) => JSON.stringify(ctx.cookie)),
				request: { path: "/c", headers: { cookie: "a=1; ; b=hello%20world" } },
				expect: {
					status: 200,
					body: { a: { value: "1" }, b: { value: "hello world" } },
				},
			},
			{
				name: "signed cookies round-trip",
				options: { signed: true, secret: "test-secret-16chars" },
				setup: (app) =>
					app
						.get("/set", ({ set }) => {
							set.cookie = { session: { value: "hello", path: "/" } };
							return "ok";
						})
						.get("/read", (ctx) => ctx.cookie.session?.value ?? ""),
				request: { path: "/set" },
				assert: async (res, app) => {
					const setCookie = res.headers.get("set-cookie") ?? "";
					const match = setCookie.match(/session=([^;]+)/);
					expect(match).not.toBeNull();
					const readRes = await app.handle(
						new Request("http://localhost/read", {
							headers: { cookie: `session=${match?.[1]}` },
						}),
					);
					expect(await readRes.text()).toBe("hello");
				},
			},
			{
				name: "encrypted cookies round-trip",
				options: { encrypted: true, secret: "test-secret-16chars" },
				setup: (app) =>
					app
						.get("/set", ({ set }) => {
							set.cookie = { session: { value: "secret-data", path: "/" } };
							return "ok";
						})
						.get("/read", (ctx) => ctx.cookie.session?.value ?? ""),
				request: { path: "/set" },
				assert: async (res, app) => {
					const setCookie = res.headers.get("set-cookie") ?? "";
					const match = setCookie.match(/session=([^;]+)/);
					expect(match).not.toBeNull();
					expect(decodeURIComponent(match![1])).toMatch(/^e:/);
					const readRes = await app.handle(
						new Request("http://localhost/read", {
							headers: { cookie: `session=${match?.[1]}` },
						}),
					);
					expect(await readRes.text()).toBe("secret-data");
				},
			},
			{
				name: "signed + encrypted cookies round-trip",
				options: {
					signed: true,
					encrypted: true,
					secret: "test-secret-16chars",
				},
				setup: (app) =>
					app
						.get("/set", ({ set }) => {
							set.cookie = { sid: { value: "both", path: "/" } };
							return "ok";
						})
						.get("/read", (ctx) => ctx.cookie.sid?.value ?? ""),
				request: { path: "/set" },
				assert: async (res, app) => {
					const setCookie = res.headers.get("set-cookie") ?? "";
					const match = setCookie.match(/sid=([^;]+)/);
					expect(match).not.toBeNull();
					const readRes = await app.handle(
						new Request("http://localhost/read", {
							headers: { cookie: `sid=${match?.[1]}` },
						}),
					);
					expect(await readRes.text()).toBe("both");
				},
			},
		],
	},
	"@ogerjs/cors": {
		factory: cors,
		cases: [
			{
				name: "sets wildcard origin by default",
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/", headers: { origin: "https://example.com" } },
				expect: {
					status: 200,
					headers: { "access-control-allow-origin": "*" },
				},
			},
			{
				name: "credentials mode reflects configured origin",
				options: { origin: "https://allowed.com", credentials: true },
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/", headers: { origin: "https://allowed.com" } },
				expect: {
					status: 200,
					headers: {
						"access-control-allow-origin": "https://allowed.com",
						"access-control-allow-credentials": "true",
					},
				},
			},
			{
				name: "OPTIONS preflight returns 204",
				request: { method: "OPTIONS", path: "/any" },
				expect: { status: 204 },
			},
		],
	},
	"@ogerjs/csrf": {
		factory: csrf,
		cases: [
			{
				name: "sets csrf cookie on safe request",
				setupAfter: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				expect: {
					status: 200,
					headers: {
						"set-cookie": /csrf=/,
					},
				},
			},
			{
				name: "rejects mutating request without matching header",
				setupAfter: (app) => app.post("/", () => "ok"),
				request: {
					method: "POST",
					path: "/",
					headers: { cookie: "csrf=abc" },
				},
				expect: { status: 403 },
			},
			{
				name: "allows mutating request when header matches cookie",
				setupAfter: (app) => app.post("/", () => "ok"),
				request: {
					method: "POST",
					path: "/",
					headers: {
						cookie: "csrf=abc",
						"x-csrf-token": "abc",
					},
				},
				expect: { status: 200 },
			},
		],
	},
	"@ogerjs/etag": {
		factory: etag,
		cases: [
			{
				name: "sets ETag and returns 304 when If-None-Match matches",
				setup: (app) => app.get("/", () => "hello"),
				request: { path: "/" },
				assert: async (res, app) => {
					const tag = res.headers.get("etag");
					expect(tag).toBeTruthy();
					const res2 = await app.handle(
						new Request("http://localhost/", {
							headers: { "if-none-match": tag! },
						}),
					);
					expect(res2.status).toBe(304);
					expect(res2.headers.get("etag")).toBe(tag);
				},
			},
		],
	},
	"@ogerjs/health": {
		factory: health,
		cases: [
			{
				name: "liveness returns ok",
				request: { path: "/health/live" },
				expect: { status: 200, body: { status: "ok" } },
			},
			{
				name: "readiness returns report",
				options: { checks: [{ name: "always", check: () => ({ ok: true }) }] },
				request: { path: "/health/ready" },
				assert: async (res) => {
					const body = await res.json();
					expect(body.status).toBe("ok");
				},
			},
		],
	},
	"@ogerjs/helmet": {
		factory: helmet,
		cases: [
			{
				name: "sets default security headers",
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				expect: {
					status: 200,
					headers: {
						"x-content-type-options": "nosniff",
						"x-frame-options": "SAMEORIGIN",
						"content-security-policy": "default-src 'self'",
						"referrer-policy": "no-referrer",
					},
				},
			},
			{
				name: "allows disabling individual headers",
				options: {
					xFrameOptions: false,
					contentSecurityPolicy: "default-src 'none'",
				},
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				expect: {
					status: 200,
					headers: {
						"x-frame-options": null,
						"content-security-policy": "default-src 'none'",
					},
				},
			},
			{
				name: "api preset denies framing",
				assert: () => {
					expect(helmetApiPreset().xFrameOptions).toBe("DENY");
				},
			},
			{
				name: "admin preset enables HSTS",
				assert: () => {
					expect(helmetAdminPreset().strictTransportSecurity).toContain(
						"max-age",
					);
				},
			},
			{
				name: "dashboard and public presets define CSP",
				assert: () => {
					expect(helmetDashboardPreset().contentSecurityPolicy).toBeTruthy();
					expect(
						helmetPublicWebsitePreset().contentSecurityPolicy,
					).toBeTruthy();
				},
			},
		],
	},
	"@ogerjs/json": {
		factory: json,
		cases: [
			{
				name: "parses json body",
				setup: (app) => app.post("/", ({ body }) => body),
				request: {
					method: "POST",
					path: "/",
					headers: { "content-type": "application/json" },
					body: { ok: true },
				},
				expect: { status: 200, body: { ok: true } },
			},
			{
				name: "returns 400 for invalid json",
				setup: (app) => app.post("/", ({ body }) => body),
				request: {
					method: "POST",
					path: "/",
					headers: { "content-type": "application/json" },
					body: "{not-json",
				},
				expect: { status: 400 },
			},
		],
	},
	"@ogerjs/jwt": {
		factory: jwt,
		cases: [
			{
				name: "verify rejects invalid secret signature",
				assert: async () => {
					expect(await verifyJwt("a.b.c", "short")).toBeNull();
				},
			},
			{
				name: "sign and verify round-trip",
				assert: async () => {
					const token = await signJwt(
						{ sub: "user1" },
						"test-secret-key-ok-16",
						"1h",
					);
					const payload = await verifyJwt(token, "test-secret-key-ok-16");
					expect(payload?.sub).toBe("user1");
				},
			},
			{
				name: "verify rejects malformed token",
				assert: async () => {
					expect(
						await verifyJwt("not-a-jwt", "test-secret-key-ok-16"),
					).toBeNull();
					expect(await verifyJwt("a.b", "test-secret-key-ok-16")).toBeNull();
					expect(
						await verifyJwt("%%%invalid%%% .b.c", "test-secret-key-ok-16"),
					).toBeNull();
				},
			},
			{
				name: "macro jwt protects route",
				options: { secret: "test-secret-key-ok-16" },
				setupAfter: (app) =>
					app.get("/me", (ctx) => (ctx as any).jwt.sub, { jwt: true }),
				request: { path: "/me" },
				assert: async (res, app) => {
					expect(res.status).toBe(401);
					const token = await signJwt(
						{ sub: "alice" },
						"test-secret-key-ok-16",
					);
					const ok = await app.handle(
						new Request("http://localhost/me", {
							headers: { authorization: `Bearer ${token}` },
						}),
					);
					expect(await ok.text()).toBe("alice");
				},
			},
			{
				name: "decorate jwt sign and verify",
				options: { secret: "test-secret-key-ok-16" },
				setup: (app) =>
					app.get("/t", async (ctx) => {
						const j = (ctx as any).jwt;
						const token = await j.sign({ role: "admin" });
						return JSON.stringify(await j.verify(token));
					}),
				request: { path: "/t" },
				expect: {
					status: 200,
					body: (parsed: any) => {
						expect(parsed.role).toBe("admin");
					},
				},
			},
		],
	},
	"@ogerjs/logger": {
		factory: logger,
		cases: [
			{
				name: "logger plugin instantiates and logs",
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				expect: { status: 200 },
			},
		],
	},
	"@ogerjs/rate-limit": {
		factory: rateLimit,
		cases: [
			{
				name: "allows requests under the limit",
				options: { max: 2, windowMs: 60_000 },
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				assert: async (res, app) => {
					expect(res.status).toBe(200);
					expect(res.headers.get("x-ratelimit-remaining")).toBe("1");
					const r2 = await app.handle(new Request("http://localhost/"));
					expect(r2.status).toBe(200);
					expect(r2.headers.get("x-ratelimit-remaining")).toBe("0");
				},
			},
			{
				name: "returns 429 when limit exceeded",
				options: { max: 1, windowMs: 60_000 },
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/" },
				assert: async (res, app) => {
					expect(res.status).toBe(200);
					const r2 = await app.handle(new Request("http://localhost/"));
					expect(r2.status).toBe(429);
				},
			},
			{
				name: "tracks keys separately",
				options: {
					max: 1,
					windowMs: 60_000,
					keyGenerator: (ctx) => ctx.request.headers.get("x-user") ?? "ip",
				},
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/", headers: { "x-user": "user1" } },
				assert: async (res, app) => {
					expect(res.status).toBe(200);
					const resSameUser = await app.handle(
						new Request("http://localhost/", {
							headers: { "x-user": "user1" },
						}),
					);
					expect(resSameUser.status).toBe(429);
					const resOtherUser = await app.handle(
						new Request("http://localhost/", {
							headers: { "x-user": "user2" },
						}),
					);
					expect(resOtherUser.status).toBe(200);
				},
			},
			{
				name: "plugin adaptive mode returns 429 under tightened cap",
				options: {
					max: 4,
					windowMs: 60_000,
					adaptive: { baseMax: 4, tightenThreshold: 1, tightenFactor: 0.25 },
				},
				setup: (app) => app.get("/", () => "ok"),
				request: { path: "/", headers: { "user-agent": "" } },
				assert: async (res, app) => {
					const limited = await app.handle(
						new Request("http://localhost/", {
							headers: { "user-agent": "Mozilla/5.0 compatible" },
						}),
					);
					expect(limited.status).toBe(429);
				},
			},
		],
	},
	"@ogerjs/sse": {
		factory: sse,
		cases: [
			{
				name: "streams events",
				setup: (app) =>
					app.get("/events", () =>
						createSseResponse(async (send) => {
							send("message", "hello");
						}),
					),
				request: { path: "/events" },
				assert: async (res) => {
					expect(res.status).toBe(200);
					expect(res.headers.get("content-type")).toBe(
						"text/event-stream; charset=utf-8",
					);
					const text = await res.text();
					expect(text).toContain("data: hello\n\n");
				},
			},
		],
	},
	"@ogerjs/static": {
		factory: staticPlugin,
		cases: [
			{
				name: "serves files from assets directory",
				options: { assets: staticSafeDir },
				request: { path: "/nested/secret.txt" },
				expect: { status: 200, body: "secret" },
			},
			{
				name: "blocks path traversal",
				options: { assets: staticSafeDir },
				request: { path: "/../secret.txt" },
				expect: { status: 404 },
			},
		],
	},
};
