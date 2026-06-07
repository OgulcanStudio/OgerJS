import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

export function serve(options: any) {
	let port = options.port ?? 3000;
	if (port === 0) {
		port = Math.floor(Math.random() * 20000) + 30000;
	}
	const hostname = options.hostname ?? "0.0.0.0";
	const fetch = options.fetch;
	if (!fetch) {
		throw new Error("[ogerjs] Bun.serve shim requires a fetch function");
	}


	const requestHandler = async (
		req: http.IncomingMessage,
		res: http.ServerResponse,
	) => {
		try {
			const protocol = (req.socket as any).encrypted ? "https" : "http";
			const host = req.headers.host || `${hostname}:${port}`;
			const url = `${protocol}://${host}${req.url || "/"}`;

			const headers = new Headers();
			for (const [key, val] of Object.entries(req.headers)) {
				if (val === undefined) continue;
				if (Array.isArray(val)) {
					for (const v of val) {
						headers.append(key, v);
					}
				} else {
					headers.set(key, val);
				}
			}

			let body: any = null;
			if (req.method !== "GET" && req.method !== "HEAD") {
				const chunks: Buffer[] = [];
				for await (const chunk of req) {
					chunks.push(chunk);
				}
				body = Buffer.concat(chunks);
			}

			const webReq = new Request(url, {
				method: req.method,
				headers,
				body,
				duplex: body ? "half" : undefined,
			} as any);

			const webRes = await fetch(webReq, serverShim);

			res.statusCode = webRes.status;
			res.statusMessage = webRes.statusText;
			webRes.headers.forEach((val: string, key: string) => {
				res.setHeader(key, val);
			});

			if ((webRes as any)._rawBody !== undefined) {
				res.end((webRes as any)._rawBody);
			} else if (webRes.body) {
				const stream = Readable.fromWeb(webRes.body as any);
				stream.pipe(res);
			} else {
				res.end();
			}
		} catch (err) {
			console.error("[ogerjs] Error in Bun.serve shim:", err);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.end("Internal Server Error");
			}
		}
	};

	let nodeServer: http.Server | https.Server;
	if (options.tls) {
		nodeServer = https.createServer(options.tls, requestHandler);
	} else {
		nodeServer = http.createServer(requestHandler);
	}

	nodeServer.listen(port, hostname);

	const serverShim = {
		get port(): number {
			const addr = nodeServer.address();
			return addr && typeof addr === "object" ? addr.port : port;
		},
		hostname,



		stop(closeActiveConnections = true) {
			if (
				closeActiveConnections &&
				typeof (nodeServer as any).closeAllConnections === "function"
			) {
				(nodeServer as any).closeAllConnections();
			}
			nodeServer.close();
		},
		pendingRequests: 0,
		pendingWebSockets: 0,
		publish() {
			return 0;
		},
		upgrade() {
			return false;
		},
	};

	return serverShim;
}
