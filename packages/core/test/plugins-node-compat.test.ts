import { describe, expect, test } from "bun:test";
import { Oger } from "../src";
import { compress } from "../../../packages/compress/src";
import { etag } from "../../../packages/etag/src";
import { health } from "../../../packages/health/src";
import { staticPlugin } from "../../../packages/static/src";
import { streamFile } from "../../../packages/stream/src";
import { parseMultipartUpload } from "../../../packages/upload/src";
import { createWebSocketHandlers } from "../../../packages/ws/src";
import { writeFileSync, unlinkSync } from "node:fs";

describe("Node.js Fallback Plugin Integrations", () => {
	test("compress, etag, health, static, stream, and ws under FORCE_NODE_COMPAT", async () => {
		try {
			(globalThis as any).FORCE_NODE_COMPAT = true;

			// Write a temp file for static & stream tests
			writeFileSync("test-static.txt", "hello static world");

			const app = new Oger();

			// 1. Compress
			app.use(compress({ threshold: 5 })); // compress everything above 5 bytes
			app.get("/compress", () => "compressible long response data");

			// 2. Etag
			app.use(etag());
			app.get("/etag", () => "etagged content");

			// 3. Health
			app.use(health({ livenessPath: "/live" }));

			// 4. Static
			app.use(staticPlugin({ assets: "." }));

			// 5. Stream
			app.get("/stream", () => streamFile("test-static.txt"));

			// 6. Upload (mocking a request with multipart/form-data)
			app.post("/upload", async ({ request }) => {
				const { files, fields } = await parseMultipartUpload(request);
				return { fileCount: files.length, firstFileName: files[0]?.name, fieldVal: fields.testField };
			});

			// 7. WebSocket Handlers
			const messages: string[] = [];
			const wsHandlers = createWebSocketHandlers({
				handlers: {
					open(ws) {
						ws.subscribe("chat");
					},
					message(ws, msg) {
						messages.push(msg.toString());
						ws.send(`echo:${msg}`);
						ws.publish("chat", `broadcast:${msg}`);
					},
					close(ws) {
						// noop
					}
				}
			});

			app.get("/ws", ({ request, server }) => {
				server!.upgrade(request);
			});

			// Start Server
			const port = 31000 + Math.floor(Math.random() * 4000);
			const server = app.listen({
				port,
				hostname: "127.0.0.1",
				websocket: wsHandlers
			});

			expect(server).toBeDefined();

			// --- VERIFY COMPRESS ---
			const rawReqPromise = new Promise<{ status: number; headers: any; bodyBytes: Uint8Array }>((resolve, reject) => {
				import("node:http").then((http) => {
					http.get(`http://127.0.0.1:${port}/compress`, {
						headers: { "accept-encoding": "gzip" }
					}, (res) => {
						const chunks: any[] = [];
						res.on("data", (chunk) => chunks.push(chunk));
						res.on("end", () => {
							resolve({
								status: res.statusCode!,
								headers: res.headers,
								bodyBytes: Buffer.concat(chunks)
							});
						});
					}).on("error", reject);
				});
			});
			const rawRes = await rawReqPromise;
			expect(rawRes.status).toBe(200);
			expect(rawRes.headers["content-encoding"]).toBe("gzip");
			// Decompress to verify content
			const decompressed = Bun.gunzipSync(rawRes.bodyBytes);
			expect(new TextDecoder().decode(decompressed)).toBe("compressible long response data");

			// --- VERIFY ETAG ---
			const etagRes = await fetch(`http://127.0.0.1:${port}/etag`);
			const etagVal = etagRes.headers.get("etag");
			expect(etagVal).toBeDefined();
			expect(etagVal).not.toBeNull();
			// Cache verification
			const etag304Res = await fetch(`http://127.0.0.1:${port}/etag`, {
				headers: { "if-none-match": etagVal! }
			});
			expect(etag304Res.status).toBe(304);

			// --- VERIFY HEALTH ---
			const healthRes = await fetch(`http://127.0.0.1:${port}/live`);
			expect(healthRes.status).toBe(200);
			expect(await healthRes.json()).toEqual({ status: "ok" });

			// --- VERIFY STATIC ---
			const staticRes = await fetch(`http://127.0.0.1:${port}/test-static.txt`);
			expect(staticRes.status).toBe(200);
			expect(await staticRes.text()).toBe("hello static world");

			// --- VERIFY STREAM ---
			const streamRes = await fetch(`http://127.0.0.1:${port}/stream`);
			expect(streamRes.status).toBe(200);
			expect(await streamRes.text()).toBe("hello static world");

			// --- VERIFY UPLOAD ---
			const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
			const multipartBody = 
				`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="testField"\r\n\r\n` +
				`fieldValue\r\n` +
				`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="file"; filename="test.txt"\r\n` +
				`Content-Type: text/plain\r\n\r\n` +
				`fileContent\r\n` +
				`--${boundary}--\r\n`;
			
			const uploadRes = await fetch(`http://127.0.0.1:${port}/upload`, {
				method: "POST",
				headers: {
					"content-type": `multipart/form-data; boundary=${boundary}`,
					"content-length": String(multipartBody.length)
				},
				body: multipartBody
			});
			expect(uploadRes.status).toBe(200);
			expect(await uploadRes.json()).toEqual({
				fileCount: 1,
				firstFileName: "test.txt",
				fieldVal: "fieldValue"
			});

			// --- VERIFY WEBSOCKETS ---
			const ws1Promise = new Promise<void>((resolve, reject) => {
				const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
				const received: string[] = [];
				ws.onopen = () => {
					ws.send("hello from client 1");
				};
				ws.onmessage = (event) => {
					received.push(event.data);
					if (received.length === 2) {
						expect(received).toContain("echo:hello from client 1");
						expect(received).toContain("broadcast:hello from client 1");
						ws.close();
						resolve();
					}
				};
				ws.onerror = (err) => reject(err);
			});

			const ws2Promise = new Promise<void>((resolve, reject) => {
				const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
				ws.onmessage = (event) => {
					expect(event.data).toBe("broadcast:hello from client 1");
					ws.close();
					resolve();
				};
				ws.onerror = (err) => reject(err);
			});

			await Promise.all([ws1Promise, ws2Promise]);
			expect(messages).toContain("hello from client 1");

			// Stop Server
			app.stop();
			unlinkSync("test-static.txt");
		} finally {
			delete (globalThis as any).FORCE_NODE_COMPAT;
		}
	});
});
