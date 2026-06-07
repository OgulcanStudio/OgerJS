import { describe, expect, test } from "bun:test";
import { Oger, t } from "../src";

describe("Oger Enterprise Edge Cases", () => {
	// 1. Routing Edge Cases
	describe("Routing & Path Parameter Handling", () => {
		test("decodes URL parameter with spaces and special characters", async () => {
			const app = new Oger().get("/users/:name", ({ params }) => decodeURIComponent(params.name));
			const res = await app.handle(new Request("http://localhost/users/Ogulcan%20Studio"));
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("Ogulcan Studio");
		});

		test("handles unicode and emoji characters in path params", async () => {
			const app = new Oger().get("/emoji/:symbol", ({ params }) => decodeURIComponent(params.symbol));
			const res1 = await app.handle(new Request("http://localhost/emoji/🚀"));
			expect(res1.status).toBe(200);
			expect(await res1.text()).toBe("🚀");

			const res2 = await app.handle(new Request("http://localhost/emoji/%E4%BD%A0%E5%A5%BD")); // 你好
			expect(res2.status).toBe(200);
			expect(await res2.text()).toBe("你好");
		});

		test("routing precedence: static > param > wildcard", async () => {
			const app = new Oger()
				.get("/api/users/list", () => "static")
				.get("/api/users/:id", ({ params }) => `param:${params.id}`)
				.get("/api/*", (ctx) => `wildcard:${ctx.params["*"]}`);

			// static match
			const res1 = await app.handle(new Request("http://localhost/api/users/list"));
			expect(await res1.text()).toBe("static");

			// param match
			const res2 = await app.handle(new Request("http://localhost/api/users/123"));
			expect(await res2.text()).toBe("param:123");

			// wildcard match
			const res3 = await app.handle(new Request("http://localhost/api/other/route/here"));
			expect(await res3.text()).toBe("wildcard:other/route/here");

			// wildcard match with trailing path segment
			const res4 = await app.handle(new Request("http://localhost/api/some-wildcard-value"));
			expect(await res4.text()).toBe("wildcard:some-wildcard-value");
		});

		test("normalizes paths to start with a slash", async () => {
			const app = new Oger().get("api/health", () => "healthy");
			
			const res = await app.handle(new Request("http://localhost/api/health"));
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("healthy");
		});

		test("supports case-insensitive standard HTTP methods", async () => {
			const app = new Oger().get("/custom", () => "ok");
			
			const res1 = await app.handle(new Request("http://localhost/custom", { method: "get" }));
			expect(res1.status).toBe(200);
			expect(await res1.text()).toBe("ok");
		});

		test("parses complex query strings including duplicate keys and empty values", async () => {
			const app = new Oger().get("/search", (ctx) => {
				const url = new URL(ctx.request.url);
				return JSON.stringify({
					q: url.searchParams.getAll("q"),
					empty: url.searchParams.get("empty"),
				});
			});
			const res = await app.handle(new Request("http://localhost/search?q=apple&q=banana&empty="));
			const data = await res.json();
			expect(data).toEqual({ q: ["apple", "banana"], empty: "" });
		});
	});

	// 2. Validation Edge Cases
	describe("Validation and Type Compliance", () => {
		test("validates deeply nested validation schema", async () => {
			const app = new Oger().post("/submit", ({ body }) => body, {
				body: t.Object({
					user: t.Object({
						id: t.Number(),
						profile: t.Object({
							email: t.String({ format: "email" }),
							tags: t.Array(t.String())
						})
					})
				})
			});

			// Valid payload
			const res1 = await app.handle(new Request("http://localhost/submit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					user: {
						id: 123,
						profile: {
							email: "test@example.com",
							tags: ["admin", "dev"]
						}
					}
				})
			}));
			expect(res1.status).toBe(200);

			// Invalid email format
			const res2 = await app.handle(new Request("http://localhost/submit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					user: {
						id: 123,
						profile: {
							email: "invalid-email",
							tags: []
						}
					}
				})
			}));
			expect(res2.status).toBe(422);

			// Missing child object
			const res3 = await app.handle(new Request("http://localhost/submit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					user: {
						id: 123
					}
				})
			}));
			expect(res3.status).toBe(422);
		});

		test("strict validation rejects invalid types (e.g. array instead of object)", async () => {
			const app = new Oger().post("/data", ({ body }) => body, {
				body: t.Object({
					items: t.Array(t.Object({ id: t.Number() }))
				})
			});

			const res = await app.handle(new Request("http://localhost/data", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ items: "not-an-array" })
			}));
			expect(res.status).toBe(422);
		});

		test("handles empty body validation on required body endpoint", async () => {
			const app = new Oger().post("/data", ({ body }) => body, {
				body: t.Object({ id: t.Number() })
			});

			const res = await app.handle(new Request("http://localhost/data", {
				method: "POST",
				headers: { "content-type": "application/json" }
			}));
			expect(res.status).toBe(400); // Bad Request (json parsing failure of empty body)
		});
	});

	// 3. Lifecycle Hooks and Context Edge Cases
	describe("Lifecycle Hooks and Context Flow", () => {
		test("executes hook pipeline in the correct sequential order", async () => {
			const order: string[] = [];
			const app = new Oger()
				.onRequest(() => { order.push("onRequest"); })
				.transform(() => { order.push("transform"); })
				.beforeHandle(() => { order.push("beforeHandle"); })
				.afterHandle(() => { order.push("afterHandle"); })
				.mapResponse(() => { order.push("mapResponse"); })
				.onAfterResponse(() => { order.push("onAfterResponse"); })
				.get("/", (ctx) => {
					order.push("handler");
					return "ok";
				});

			const res = await app.handle(new Request("http://localhost/"));
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("ok");
			
			// Wait a brief moment to let onAfterResponse (which runs asynchronously after response sent) execute
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(order).toEqual([
				"onRequest",
				"transform",
				"beforeHandle",
				"handler",
				"afterHandle",
				"mapResponse",
				"onAfterResponse"
			]);
		});

		test("beforeHandle hook short-circuits execution when returning a Response", async () => {
			const order: string[] = [];
			const app = new Oger()
				.beforeHandle(() => {
					order.push("before1");
				})
				.beforeHandle(() => {
					order.push("before2");
					return new Response("short-circuited", { status: 403 });
				})
				.beforeHandle(() => {
					order.push("before3");
				})
				.get("/", (ctx) => {
					order.push("handler");
					return "ok";
				});

			const res = await app.handle(new Request("http://localhost/"));
			expect(res.status).toBe(403);
			expect(await res.text()).toBe("short-circuited");
			expect(order).toEqual(["before1", "before2"]);
		});

		test("recovers gracefully and triggers onError when an error is thrown in handler or hooks", async () => {
			let errorCaught: Error | null = null;
			const app = new Oger()
				.onError((ctx) => {
					errorCaught = ctx.error as Error;
					return new Response("custom-error-response", { status: 500 });
				})
				.get("/throw", (ctx) => {
					throw new Error("Catastrophic failure");
				});

			const res = await app.handle(new Request("http://localhost/throw"));
			expect(res.status).toBe(500);
			expect(await res.text()).toBe("custom-error-response");
			expect(errorCaught).not.toBeNull();
			expect(errorCaught!.message).toBe("Catastrophic failure");
		});

		test("recovers gracefully from circular error references or non-error throws", async () => {
			const app = new Oger()
				.onError(({ error }) => {
					return new Response(`Caught: ${String(error)}`, { status: 500 });
				})
				.get("/throw-string", (ctx) => {
					throw "string-error";
				});
			const res = await app.handle(new Request("http://localhost/throw-string"));
			expect(res.status).toBe(500);
			expect(await res.text()).toBe("Caught: string-error");
		});

		test("passes context decorators and derives down the pipeline", async () => {
			const app = new Oger()
				.decorate({ version: "1.0.0" })
				.derive((ctx) => {
					const token = ctx.request.headers.get("authorization");
					return { user: token ? "admin" : "guest" };
				})
				.get("/whoami", (ctx: any) => {
					return `${ctx.user} on v${ctx.version}`;
				});

			const res1 = await app.handle(new Request("http://localhost/whoami"));
			expect(await res1.text()).toBe("guest on v1.0.0");

			const res2 = await app.handle(new Request("http://localhost/whoami", {
				headers: { authorization: "Bearer xyz" }
			}));
			expect(await res2.text()).toBe("admin on v1.0.0");
		});
	});

	// 4. Node.js Compatibility Fallback Edge Cases
	describe("Node.js Compatibility Fallback Edge Cases", () => {
		test("handles request cloning and double read of Node request bodies", async () => {
			try {
				(globalThis as any).FORCE_NODE_COMPAT = true;
				const app = new Oger().post("/clone-test", async ({ request }) => {
					const reqClone = request.clone();
					const text1 = await request.text();
					const text2 = await reqClone.text();
					return JSON.stringify({ text1, text2 });
				});

				const port = 31000 + Math.floor(Math.random() * 4000);
				app.listen({ port, hostname: "127.0.0.1" });

				const res = await fetch(`http://127.0.0.1:${port}/clone-test`, {
					method: "POST",
					headers: { "content-type": "text/plain" },
					body: "hello payload"
				});
				expect(res.status).toBe(200);
				const data = await res.json();
				expect(data).toEqual({ text1: "hello payload", text2: "hello payload" });

				app.stop();
			} finally {
				delete (globalThis as any).FORCE_NODE_COMPAT;
			}
		});

		test("rejects request payload if it exceeds bodyLimit in Node fallback", async () => {
			try {
				(globalThis as any).FORCE_NODE_COMPAT = true;
				const app = new Oger({ bodyLimit: 20 }).post("/limit-test", async ({ request }) => {
					return await request.text();
				});

				const port = 31000 + Math.floor(Math.random() * 4000);
				app.listen({ port, hostname: "127.0.0.1" });

				let errCaught: any = null;
				try {
					await fetch(`http://127.0.0.1:${port}/limit-test`, {
						method: "POST",
						body: "x".repeat(100)
					});
				} catch (e) {
					errCaught = e;
				}
				
				// Rejection destroys the socket, causing a connection error
				expect(errCaught).not.toBeNull();

				app.stop();
			} finally {
				delete (globalThis as any).FORCE_NODE_COMPAT;
			}
		});

		test("static POST routes drain body and return prebuilt JSON response", async () => {
			const payload = '{"accepted":true,"amountCents":50000}';
			const staticRes = new Response(payload, {
				headers: { "content-type": "application/json" },
			});
			(staticRes as { _rawBody?: string })._rawBody = payload;

			const app = new Oger()
				.post("/bench/transfer", async (request) => {
					await request.text();
					return staticRes;
				}, { staticResponse: staticRes });

			const res = await app.handle(
				new Request("http://127.0.0.1/bench/transfer", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: '{"fromAccount":"a","toAccount":"b","amountCents":50000,"currency":"USD","reference":"x"}',
				}),
			);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe(payload);
		});

		test("auth gate routes return 401 without token and JSON when authorized", async () => {
			const okBody = '{"authorized":true}';
			const okRes = new Response(okBody, { headers: { "content-type": "application/json" } });
			(okRes as { _rawBody?: string })._rawBody = okBody;
			const denyRes = new Response("unauthorized", { status: 401 });

			const app = new Oger().get("/bench/auth", () => okBody, {
				staticResponse: okRes,
				beforeHandle: ({ request }) => {
					if (request.headers.get("authorization") !== "Bearer bench-token") {
						return denyRes;
					}
				},
			});

			const denied = await app.handle(new Request("http://127.0.0.1/bench/auth"));
			expect(denied.status).toBe(401);

			const allowed = await app.handle(
				new Request("http://127.0.0.1/bench/auth", {
					headers: { authorization: "Bearer bench-token" },
				}),
			);
			expect(allowed.status).toBe(200);
			expect(await allowed.text()).toBe(okBody);
		});

		test("verifies OgerNodeHeaders has, get, and entries matching standard Headers interface", async () => {
			const mockIncomingHeaders = {
				"x-custom-header": "value1",
				"set-cookie": ["cookie1=a", "cookie2=b"],
				"content-type": "application/json"
			};

			const { OgerNodeHeaders } = await import("../src/oger");
			const headers = new OgerNodeHeaders(mockIncomingHeaders);

			expect(headers.has("x-custom-header")).toBe(true);
			expect(headers.has("missing")).toBe(false);
			expect(headers.get("x-custom-header")).toBe("value1");
			expect(headers.get("SET-COOKIE")).toBe("cookie1=a, cookie2=b");
			
			const entries = Array.from(headers.entries());
			expect(entries).toContainEqual(["x-custom-header", "value1"]);
			expect(entries).toContainEqual(["set-cookie", "cookie1=a, cookie2=b"]);
		});
	});
});
