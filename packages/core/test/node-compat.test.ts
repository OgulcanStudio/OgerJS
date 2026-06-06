import { describe, expect, test } from "bun:test";
import { Oger } from "../src";

describe("Node.js compatibility fallback", () => {
	test("listen starts a Node http server when Bun is not defined", async () => {
		try {
			// Force Node compat mode
			(globalThis as any).FORCE_NODE_COMPAT = true;

			const app = new Oger();
			app.get("/", () => "Hello from Node fallback");
			app.post("/echo", async ({ request }) => {
				const body = await request.json();
				return body;
			});

			// Start server on a random/free port
			const port = 30000 + Math.floor(Math.random() * 5000);
			const server = app.listen({ port, hostname: "127.0.0.1" });

			expect(server).toBeDefined();
			expect(server.port).toBe(port);

			// Perform GET request
			const res = await fetch(`http://127.0.0.1:${port}/`);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("Hello from Node fallback");

			// Perform POST request with body
			const postRes = await fetch(`http://127.0.0.1:${port}/echo`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ hello: "world" }),
			});
			expect(postRes.status).toBe(200);
			const postBody = await postRes.json();
			expect(postBody).toEqual({ hello: "world" });

			// Stop the server
			app.stop();
		} finally {
			// Clean up global mock
			delete (globalThis as any).FORCE_NODE_COMPAT;
		}
	});
});
