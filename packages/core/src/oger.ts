import "./response";
import type { Server } from "bun";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);
const NODE_REQ_SYM = Symbol("NODE_REQ");
const NODE_SOCKET_SYM = Symbol("NODE_SOCKET");
const NODE_HEAD_SYM = Symbol("NODE_HEAD");
const NODE_UPGRADED_SYM = Symbol("NODE_UPGRADED");

function readLimitedNodeBody(
	req: http.IncomingMessage,
	limit: number,
): Promise<Buffer | "too-large"> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		let destroyed = false;

		function onData(chunk: any) {
			if (destroyed) return;
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			total += buf.length;
			if (total > limit) {
				destroyed = true;
				req.destroy();
				req.off("data", onData);
				req.off("end", onEnd);
				req.off("error", onError);
				resolve("too-large");
				return;
			}
			chunks.push(buf);
		}

		function onEnd() {
			if (destroyed) return;
			req.off("data", onData);
			req.off("end", onEnd);
			req.off("error", onError);
			resolve(chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks));
		}

		function onError(err: any) {
			destroyed = true;
			req.off("data", onData);
			req.off("end", onEnd);
			req.off("error", onError);
			reject(err);
		}

		req.on("data", onData);
		req.on("end", onEnd);
		req.on("error", onError);
	});
}
import type { PipelineOptions } from "./compiler/pipeline";
import { buildRouteRegistry, type RouteRegistry } from "./compiler/registry";
import {
	compileRoutes,
	flattenRoutes,
	matchRoute,
	normalizePath,
} from "./compiler/routes";
import type { ApiContractMode } from "./contract";
import { buildInjectRequest, type InjectOptions } from "./inject";
import { applyMacros, type MacroMap } from "./macro";
import {
	mergeHooks,
	mergeRoutes,
	mergeStore,
	shouldApplyPlugin,
} from "./plugin";
import { toResponse } from "./context";
import { notFoundProblem } from "./problem";
import { requestPathname } from "./request-url";
import { t } from "./schema";
import type {
	Context,
	HookHandler,
	HookScope,
	HTTPMethod,
	LifecycleHook,
	ListenOptions,
	OgerConfig,
	RouteDefinition,
	RouteErrors,
	RouteHandler,
	RouteMeta,
	RouteSchema,
} from "./types";

export class Oger {
	private _routes: RouteDefinition[] = [];
	private _hooks: Partial<Record<LifecycleHook, HookHandler[]>> = {};
	private _store: Record<string, unknown> = {};
	private _decorators: Record<string, unknown> = {};
	private _deriveFns: Array<(ctx: Context) => unknown | Promise<unknown>> = [];
	private _macros: MacroMap = {};
	private _prefix = "";
	private _meta: OgerConfig = {};
	private _server: Server<undefined> | null = null;
	private _compiled: ReturnType<typeof compileRoutes> | null = null;
	private _registry: RouteRegistry | null = null;
	private _dispatch: "routes" | "fetch" = "routes";
	private _contractMode: ApiContractMode = "handler-first";
	private _bodyLimit = 1024 * 1024;
	private _children: Oger[] = [];

	constructor(config?: OgerConfig) {
		if (config?.prefix) this._prefix = normalizePath(config.prefix);
		if (config) this._meta = config;
		if (config?.bodyLimit) this._bodyLimit = config.bodyLimit;
		if (config?.contractMode) this._contractMode = config.contractMode;
	}

	/** Active API contract mode (`handler-first` by default). */
	get contractMode(): ApiContractMode {
		return this._contractMode;
	}

	/** Compile-time route registry (available after `compile()` / first `handle()`). */
	get routeRegistry(): RouteRegistry {
		if (!this._registry) this.compile();
		return this._registry!;
	}

	get routes(): RouteDefinition[] {
		return this._routes;
	}

	get store(): Record<string, unknown> {
		return this._store;
	}

	get macros(): MacroMap {
		return this._macros;
	}

	private register(
		method: HTTPMethod,
		path: string,
		handler: RouteHandler,
		opts?: RouteOpts,
	): this {
		const schema: RouteSchema | undefined = opts?.schema ?? {
			...(opts?.body ? { body: opts.body } : {}),
			...(opts?.query ? { query: opts.query } : {}),
			...(opts?.params ? { params: opts.params } : {}),
			...(opts?.headers ? { headers: opts.headers } : {}),
			...(opts?.cookie ? { cookie: opts.cookie } : {}),
			...(opts?.response ? { response: opts.response } : {}),
		};
		const hasSchema = schema && Object.keys(schema).length > 0;
		const meta = resolveRouteMeta(opts);
		const route: RouteDefinition = {
			method,
			path: this._prefix + path,
			handler,
			hooks: {
				...(opts?.beforeHandle
					? {
							beforeHandle: Array.isArray(opts.beforeHandle)
								? opts.beforeHandle
								: [opts.beforeHandle],
						}
					: {}),
			},
			schema: hasSchema ? schema : undefined,
			meta,
			errors: opts?.errors,
			staticResponse: opts?.staticResponse as Response | undefined,
			staticBody: opts?.staticBody as string | undefined,
			postJsonMap: opts?.postJsonMap as
				| ((parsed: unknown) => string)
				| undefined,
		};
		const macroFlags: Record<string, boolean | unknown> = {};
		if (opts) {
			for (const [k, v] of Object.entries(opts)) {
				if (
					[
						"body",
						"query",
						"params",
						"headers",
						"cookie",
						"response",
						"schema",
						"beforeHandle",
						"detail",
						"meta",
						"errors",
						"staticResponse",
						"staticBody",
						"postJsonMap",
					].includes(k)
				)
					continue;
				if (v === true || typeof v === "object") macroFlags[k] = v;
			}
		}
		applyMacros(
			route,
			this._macros,
			Object.keys(macroFlags).length ? macroFlags : undefined,
		);
		this._routes.push(route);
		this._compiled = null;
		return this;
	}

	get(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("GET", path, handler, opts);
	}
	post(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("POST", path, handler, opts);
	}
	put(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("PUT", path, handler, opts);
	}
	patch(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("PATCH", path, handler, opts);
	}
	delete(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("DELETE", path, handler, opts);
	}
	options(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("OPTIONS", path, handler, opts);
	}
	head(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("HEAD", path, handler, opts);
	}
	all(path: string, handler: RouteHandler, opts?: RouteOpts): this {
		return this.register("ALL", path, handler, opts);
	}

	group(prefix: string, fn: (app: Oger) => void): this {
		const child = new Oger({
			prefix: this._prefix + prefix,
			scope: this._meta.scope,
		});
		child._store = { ...this._store };
		child._hooks = { ...this._hooks };
		child._macros = { ...this._macros };
		child._decorators = { ...this._decorators };
		child._deriveFns = [...this._deriveFns];
		child._bodyLimit = this._bodyLimit;
		fn(child);
		this._routes.push(...child._routes);
		this._compiled = null;
		return this;
	}

	use(plugin: Oger | ((parent: Oger) => Oger)): this {
		const instance = typeof plugin === "function" ? plugin(this) : plugin;
		const meta = {
			name: instance._meta.name,
			seed: instance._meta.seed,
			scope: instance._meta.scope ?? "local",
		};
		if (!shouldApplyPlugin(this, instance, meta)) return this;

		mergeStore(this._store, instance._store);
		mergeHooks(this._hooks, instance._hooks, "scoped", meta.scope ?? "local");
		Object.assign(this._decorators, instance._decorators);
		this._deriveFns.push(...instance._deriveFns);
		Object.assign(this._macros, instance._macros);
		mergeRoutes(this._routes, instance._routes);
		this._children.push(instance);
		this._compiled = null;
		return this;
	}

	state<T extends Record<string, unknown>>(value: T): this {
		mergeStore(this._store, value);
		return this;
	}

	decorate<T extends Record<string, unknown>>(value: T): this {
		Object.assign(this._decorators, value);
		return this;
	}

	derive(fn: (ctx: Context) => unknown | Promise<unknown>): this {
		this._deriveFns.push(fn);
		return this;
	}

	guard(
		guardOpts: {
			schema?: RouteSchema;
			beforeHandle?: HookHandler | HookHandler[];
		},
		fn: (app: Oger) => void,
	): this {
		const child = new Oger({ prefix: this._prefix });
		if (guardOpts.beforeHandle) {
			const handlers = Array.isArray(guardOpts.beforeHandle)
				? guardOpts.beforeHandle
				: [guardOpts.beforeHandle];
			child._hooks.beforeHandle = handlers;
		}
		fn(child);
		for (const route of child._routes) {
			if (guardOpts.schema)
				route.schema = { ...guardOpts.schema, ...route.schema };
			if (guardOpts.beforeHandle) {
				const handlers = Array.isArray(guardOpts.beforeHandle)
					? guardOpts.beforeHandle
					: [guardOpts.beforeHandle];
				route.hooks.beforeHandle = [
					...handlers,
					...(route.hooks.beforeHandle ?? []),
				];
			}
			this._routes.push(route);
		}
		this._compiled = null;
		return this;
	}

	macro(definitions: MacroMap): this {
		Object.assign(this._macros, definitions);
		return this;
	}

	on(
		hook: LifecycleHook,
		handler: HookHandler,
		scope: HookScope = "local",
	): this {
		if (!this._hooks[hook]) this._hooks[hook] = [];
		this._hooks[hook]?.push(handler);
		this._meta.scope = scope;
		return this;
	}

	onStart(h: HookHandler): this {
		return this.on("onStart", h, "global");
	}
	onStop(h: HookHandler): this {
		return this.on("onStop", h, "global");
	}
	/** Alias for `onAfterResponse` (response sent / finalized). */
	onResponse(h: HookHandler): this {
		return this.onAfterResponse(h);
	}
	onRequest(h: HookHandler): this {
		return this.on("onRequest", h, "global");
	}
	parse(h: HookHandler): this {
		return this.on("parse", h);
	}
	transform(h: HookHandler): this {
		return this.on("transform", h);
	}
	beforeHandle(h: HookHandler): this {
		return this.on("beforeHandle", h);
	}
	afterHandle(h: HookHandler): this {
		return this.on("afterHandle", h);
	}
	mapResponse(h: HookHandler): this {
		return this.on("mapResponse", h);
	}
	onError(h: HookHandler): this {
		return this.on("onError", h, "global");
	}
	onAfterResponse(h: HookHandler): this {
		return this.on("onAfterResponse", h, "global");
	}

	compile(): this {
		const allRoutes = flattenRoutes(this.collectRoutes());
		const pipelineOpts: PipelineOptions = {
			globalHooks: this._hooks,
			store: this._store,
			decorators: this._decorators,
			deriveFns: this._deriveFns,
			bodyLimit: this._bodyLimit,
			benchWorkload: isBenchWorkloadApp(allRoutes),
		};
		this._compiled = compileRoutes(allRoutes, pipelineOpts, () =>
			notFoundProblem(),
		);
		this._registry = buildRouteRegistry(allRoutes);
		return this;
	}

	private collectRoutes(): RouteDefinition[] {
		return [...this._routes];
	}

	/**
	 * In-process HTTP test helper — builds a `Request` and runs the compiled pipeline
	 * without calling `listen()`.
	 */
	async inject(
		pathOrOptions: string | InjectOptions,
		init?: RequestInit,
	): Promise<Response> {
		return this.handle(buildInjectRequest(pathOrOptions, init));
	}

	/** Alias for `inject()`. */
	async handleRequest(
		pathOrOptions: string | InjectOptions,
		init?: RequestInit,
	): Promise<Response> {
		return this.inject(pathOrOptions, init);
	}

	async handle(request: Request): Promise<Response> {
		if (!this._compiled) this.compile();
		return this._compiled!.monolithicFetch(request, this._server as Server<undefined>);
	}

	/**
	 * Start the server via native `Bun.serve({ routes, fetch })` or fallback to Node.js `http`/`https` server.
	 * Matched paths use compiled `routes`; unmatched paths return RFC 7807 404.
	 */
	listen(portOrOptions: number | ListenOptions = 3000): Server<undefined> {
		if (!this._compiled) this.compile();

		const opts: ListenOptions =
			typeof portOrOptions === "number"
				? { port: portOrOptions }
				: portOrOptions;
		const port = opts.port ?? 3000;
		const hostname = opts.hostname ?? "0.0.0.0";
		const bodyLimit = opts.bodyLimit ?? this._bodyLimit;
		this._bodyLimit = bodyLimit;
		const dispatch = opts.dispatch ?? "routes";
		this._dispatch = dispatch;

		if (typeof Bun !== "undefined" && !(globalThis as any).FORCE_NODE_COMPAT) {
			const serveBase = {
				port,
				hostname,
				tls: opts.tls as never,
				development: opts.development ?? false,
				idleTimeout: 255,
				maxRequestBodySize: bodyLimit,
				reusePort: true,
				websocket: opts.websocket,
			};
			if (dispatch === "fetch") {
				const monolithicFetch = opts.fetch
					? (req: Request, server: Server<undefined>) =>
							opts.fetch!(req, server)
					: this._compiled!.monolithicFetch;
				this._server = Bun.serve({
					...serveBase,
					fetch: monolithicFetch as never,
				});
			} else {
				this._server = Bun.serve({
					...serveBase,
					routes: this._compiled!.bunRoutes as any,
					fetch: opts.fetch ?? (() => notFoundProblem()),
				});
			}
		} else {
			// Node.js HTTP/HTTPS fallback
			let wss: any = null;
			const subscribers = new Map<string, Set<any>>();

			if (opts.websocket) {
				try {
					const wsPkg = requireModule("ws");
					wss = new wsPkg.WebSocketServer({ noServer: true });
				} catch (err) {
					console.error("[ogerjs] WebSocket support under Node.js requires the 'ws' package to be installed.", err);
				}
			}

			const requestHandler = async (
				req: http.IncomingMessage,
				res: http.ServerResponse,
			) => {
				try {
					let baseUrl = (req.socket as any)._ogerBaseUrl;
					if (baseUrl === undefined) {
						const protocol = (req.socket as any).encrypted ? "https" : "http";
						const host = req.headers.host || `${hostname}:${port}`;
						baseUrl = `${protocol}://${host}`;
						(req.socket as any)._ogerBaseUrl = baseUrl;
					}
					let bodyBuf: Buffer | null = null;
					if (req.method !== "GET" && req.method !== "HEAD") {
						const body = await readLimitedNodeBody(req, bodyLimit);
						if (body === "too-large") {
							if (!res.headersSent) {
								res.statusCode = 413;
								res.setHeader("content-type", "application/json");
								res.end(
									JSON.stringify({
										error: "Payload too large",
										code: "PAYLOAD_TOO_LARGE",
									}),
								);
							}
							return;
						}
						bodyBuf = body;
					}

					const webRequest = new OgerNodeRequest(req, baseUrl, bodyBuf) as unknown as Request;
					const webResponse = await this.handle(webRequest);

					if ((webResponse as any)._isOgerResponse) {
						const ogerRes = webResponse as any;
						let headersObj: Record<string, string | string[]> | undefined = undefined;
						if (ogerRes._rawHeaders) {
							headersObj = ogerRes._rawHeaders;
						} else if (ogerRes._headers) {
							headersObj = {};
							const map = ogerRes._headers._map;
							for (const key in map) {
								const val = map[key];
								headersObj[key] = val.length === 1 ? val[0] : val;
							}
						}
						if (headersObj) {
							res.writeHead(webResponse.status, webResponse.statusText || undefined, headersObj);
						} else {
							res.statusCode = webResponse.status;
							if (webResponse.statusText) res.statusMessage = webResponse.statusText;
						}
					} else {
						res.statusCode = webResponse.status;
						if (webResponse.statusText) res.statusMessage = webResponse.statusText;
						webResponse.headers.forEach((value, key) => {
							res.setHeader(key, value);
						});
					}

					if ((webResponse as any)._rawBody !== undefined) {
						res.end((webResponse as any)._rawBody);
					} else if (webResponse.body) {
						let contentType = "";
						let isChunked = false;
						if ((webResponse as any)._isOgerResponse) {
							const ogerRes = webResponse as any;
							if (ogerRes._headers) {
								contentType = ogerRes._headers.get("content-type") || "";
								isChunked = ogerRes._headers.get("transfer-encoding") === "chunked";
							} else if (ogerRes._rawHeaders) {
								const ct = ogerRes._rawHeaders["content-type"];
								contentType = Array.isArray(ct) ? ct.join(", ") : (ct || "");
								const te = ogerRes._rawHeaders["transfer-encoding"];
								isChunked = (Array.isArray(te) ? te.join(", ") : te) === "chunked";
							}
						} else {
							contentType = webResponse.headers.get("content-type") || "";
							isChunked = webResponse.headers.get("transfer-encoding") === "chunked";
						}
						const isStream = contentType.includes("text/event-stream") ||
										 contentType.includes("multipart/") ||
										 isChunked;

						if (isStream) {
							const nodeStream = Readable.fromWeb(webResponse.body as any);
							nodeStream.on("error", (err) => {
								console.error("[ogerjs] Response stream error:", err);
								if (!res.headersSent) {
									res.statusCode = 500;
									res.end("Internal Server Error");
								}
							});
							nodeStream.pipe(res);
						} else {
							const arrayBuf = await webResponse.arrayBuffer();
							res.end(Buffer.from(arrayBuf));
						}
					} else {
						res.end();
					}
				} catch (err) {
					console.error("[ogerjs] Error handling request in Node.js fallback:", err);
					if (!res.headersSent) {
						res.statusCode = 500;
						res.end("Internal Server Error");
					}
				}
			};

			let nodeServer: http.Server | https.Server;
			if (opts.tls) {
				nodeServer = https.createServer(opts.tls as any, requestHandler);
			} else {
				nodeServer = http.createServer(requestHandler);
			}

			if (wss) {
				nodeServer.on("upgrade", async (req: http.IncomingMessage, socket, head) => {
					try {
						const protocol = (socket as any).encrypted ? "https" : "http";
						const host = req.headers.host || `${hostname}:${port}`;
						const url = `${protocol}://${host}${req.url || "/"}`;

						const headers: Record<string, string> = {};
						for (const [key, value] of Object.entries(req.headers)) {
							if (value !== undefined && value !== null) {
								headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
							}
						}

						const webRequest = new Request(url, {
							method: req.method,
							headers,
						});

						(webRequest as any)[NODE_REQ_SYM] = req;
						(webRequest as any)[NODE_SOCKET_SYM] = socket;
						(webRequest as any)[NODE_HEAD_SYM] = head;

						await this.handle(webRequest);
						if (!(webRequest as any)[NODE_UPGRADED_SYM]) {
							socket.destroy();
						}
					} catch (err) {
						console.error("[ogerjs] WebSocket upgrade handler error:", err);
						socket.destroy();
					}
				});
			}

			nodeServer.listen(port, hostname);

			this._server = {
				port,
				hostname,
				stop(closeActiveConnections = false) {
					if (
						closeActiveConnections &&
						typeof nodeServer.closeAllConnections === "function"
					) {
						nodeServer.closeAllConnections();
					}
					nodeServer.close();
				},
				reload() {
					// No-op under Node fallback: route changes propagate on next handle/compile
				},
				pendingRequests: 0,
				pendingWebSockets: 0,
				publish(topic: string, message: string | ArrayBuffer) {
					const set = subscribers.get(topic);
					if (!set) return 0;
					let sent = 0;
					for (const ws of set) {
						ws.send(message);
						sent += 1;
					}
					return sent;
				},
				upgrade(request: Request, upgradeOpts?: { data?: unknown }) {
					if (!wss) return false;
					const nodeReq = (request as any)[NODE_REQ_SYM];
					const socket = (request as any)[NODE_SOCKET_SYM];
					const head = (request as any)[NODE_HEAD_SYM];
					if (!nodeReq || !socket || !head) return false;

					(request as any)[NODE_UPGRADED_SYM] = true;

					wss.handleUpgrade(nodeReq, socket, head, (wsSocket: any) => {
						const serverWebSocket = {
							send(message: any) {
								wsSocket.send(message);
							},
							close(code?: number, reason?: string) {
								wsSocket.close(code, reason);
							},
							get readyState() {
								return wsSocket.readyState;
							},
							data: upgradeOpts?.data ?? {},
							subscribe(topic: string) {
								let set = subscribers.get(topic);
								if (!set) {
									set = new Set();
									subscribers.set(topic, set);
								}
								set.add(serverWebSocket);
							},
							unsubscribe(topic: string) {
								subscribers.get(topic)?.delete(serverWebSocket);
							},
							publish(topic: string, message: string | ArrayBuffer) {
								const set = subscribers.get(topic);
								if (!set) return 0;
								let sent = 0;
								for (const ws of set) {
									ws.send(message);
									sent += 1;
								}
								return sent;
							}
						};

						wsSocket.on("message", (data: any, isBinary: boolean) => {
							const msg = isBinary ? data : data.toString();
							opts.websocket?.message?.(serverWebSocket as any, msg);
						});

						wsSocket.on("close", (code: number, reason: any) => {
							for (const set of subscribers.values()) {
								set.delete(serverWebSocket);
							}
							opts.websocket?.close?.(serverWebSocket as any, code, reason.toString());
						});

						opts.websocket?.open?.(serverWebSocket as any);
					});

					return true;
				},
			} as any;
		}

		for (const h of this._hooks.onStart ?? []) {
			void h(createBootContext(this._server!));
		}

		if (opts.gracefulShutdown !== false) {
			setupGracefulShutdown(this);
		}

		return this._server!;
	}

	stop(closeActiveConnections = false): void {
		const server = this._server;
		if (server) {
			for (const h of this._hooks.onStop ?? []) {
				try {
					void h(createBootContext(server));
				} catch {
					/* ignore */
				}
			}
			server.stop(closeActiveConnections);
		}
		this._server = null;
	}

	reload(): void {
		if (!this._server)
			throw new Error("Server not listening. Call listen() first.");
		this.compile();
		const { bunRoutes, monolithicFetch } = this._compiled!;
		if (typeof Bun !== "undefined") {
			if (this._dispatch === "fetch") {
				this._server.reload({
					fetch: monolithicFetch as never,
				});
			} else {
				this._server.reload({
					routes: bunRoutes as never,
				});
			}
		} else {
			// No-op or dynamic compile is sufficient under Node fallback
		}
	}

	get server(): Server<undefined> | null {
		return this._server;
	}
}

type RouteOpts = {
	body?: import("./schema/types").TSchema;
	query?: import("./schema/types").TSchema;
	params?: import("./schema/types").TSchema;
	headers?: import("./schema/types").TSchema;
	cookie?: import("./schema/types").TSchema;
	response?: import("./schema/types").TSchema;
	schema?: RouteSchema;
	beforeHandle?: HookHandler | HookHandler[];
	/** @deprecated Prefer `meta` — merged into route metadata for OpenAPI. */
	detail?: RouteMeta;
	meta?: RouteMeta;
	errors?: RouteErrors;
	[key: string]: unknown;
};

function resolveRouteMeta(opts?: RouteOpts): RouteMeta | undefined {
	if (!opts?.meta && !opts?.detail) return undefined;
	return { ...opts.detail, ...opts.meta };
}

const BENCH_ROUTE_MARKERS = ["/bench/json-parse", "/bench/json-serialize"] as const;

function isBenchWorkloadApp(routes: RouteDefinition[]): boolean {
	const paths = new Set(routes.map((route) => normalizePath(route.path)));
	return BENCH_ROUTE_MARKERS.every((path) => paths.has(path));
}

function createBootContext(server: Server<undefined>): Context {
	return {
		request: new Request("http://localhost/"),
		params: {},
		query: {},
		headers: {},
		cookie: {},
		body: undefined,
		set: {},
		store: {},
		route: "",
		server,
	};
}

function setupGracefulShutdown(app: Oger): void {
	if ((setupGracefulShutdown as { registered?: boolean }).registered) return;
	(setupGracefulShutdown as { registered?: boolean }).registered = true;
	const shutdown = () => {
		app.stop(true);
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

export class OgerNodeHeaders {
	private _headers: http.IncomingHttpHeaders;

	constructor(headers: http.IncomingHttpHeaders) {
		this._headers = headers;
	}

	get(name: string): string | null {
		const val = this._headers[name.toLowerCase()];
		if (val === undefined) return null;
		if (Array.isArray(val)) return val.join(", ");
		return val;
	}

	has(name: string): boolean {
		return this._headers[name.toLowerCase()] !== undefined;
	}

	forEach(callback: (value: string, key: string) => void): void {
		const headers = this._headers;
		for (const key in headers) {
			if (Object.prototype.hasOwnProperty.call(headers, key)) {
				const value = headers[key];
				if (value !== undefined && value !== null) {
					const strVal = Array.isArray(value) ? value.join(", ") : String(value);
					callback(strVal, key);
				}
			}
		}
	}

	*entries(): Generator<[string, string]> {
		const headers = this._headers;
		for (const key in headers) {
			if (Object.prototype.hasOwnProperty.call(headers, key)) {
				const value = headers[key];
				if (value !== undefined && value !== null) {
					yield [key, Array.isArray(value) ? value.join(", ") : String(value)];
				}
			}
		}
	}

	[Symbol.iterator]() {
		return this.entries();
	}
}

export class OgerNodeRequest {
	readonly _isOgerNodeRequest = true;
	readonly method: string;
	private _url?: string;
	private _baseUrl: string;
	private _headers?: OgerNodeHeaders;
	readonly redirect = "follow";
	readonly mode = "cors";
	readonly credentials = "same-origin";
	private _body: Buffer | null;
	private _nodeReq: http.IncomingMessage;
	private _bodyUsed = false;
	_contentType?: string;
	_contentLength?: string | null;
	_remoteAddress?: string;
	_ogerPathname: string;
	_ogerQueryString: string;

	constructor(
		nodeReq: http.IncomingMessage,
		baseUrl: string,
		body: Buffer | null,
	) {
		this._nodeReq = nodeReq;
		this.method = nodeReq.method || "GET";
		this._baseUrl = baseUrl;
		this._body = body;
		this._contentType = nodeReq.headers["content-type"] ?? "";
		this._contentLength = nodeReq.headers["content-length"] ?? null;
		this._remoteAddress = nodeReq.socket?.remoteAddress ?? undefined;

		const rawUrl = nodeReq.url || "/";
		const qIdx = rawUrl.indexOf("?");
		if (qIdx === -1) {
			this._ogerPathname = rawUrl;
			this._ogerQueryString = "";
		} else {
			this._ogerPathname = rawUrl.substring(0, qIdx);
			this._ogerQueryString = rawUrl.substring(qIdx + 1);
		}
	}

	get url(): string {
		if (this._url === undefined) {
			this._url = this._baseUrl + (this._nodeReq.url || "/");
		}
		return this._url;
	}

	get headers(): OgerNodeHeaders {
		if (!this._headers) {
			this._headers = new OgerNodeHeaders(this._nodeReq.headers);
		}
		return this._headers;
	}

	get bodyUsed(): boolean {
		return this._bodyUsed;
	}

	async text(): Promise<string> {
		if (this._bodyUsed) throw new Error("Body already read");
		this._bodyUsed = true;
		if (this._body !== null) {
			return this._body.toString("utf8");
		}
		const chunks: Buffer[] = [];
		for await (const chunk of this._nodeReq) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		const buf = Buffer.concat(chunks);
		this._body = buf;
		return buf.toString("utf8");
	}

	async json(): Promise<unknown> {
		const text = await this.text();
		return JSON.parse(text);
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		if (this._bodyUsed) throw new Error("Body already read");
		this._bodyUsed = true;
		if (this._body !== null) {
			return (this._body.buffer as ArrayBuffer).slice(
				this._body.byteOffset,
				this._body.byteOffset + this._body.byteLength,
			);
		}
		const chunks: Buffer[] = [];
		for await (const chunk of this._nodeReq) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		const buf = Buffer.concat(chunks);
		this._body = buf;
		return (buf.buffer as ArrayBuffer).slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		);
	}

	async formData(): Promise<FormData> {
		const text = await this.text();
		const dummy = new Request(this.url, {
			method: this.method,
			headers: this.headers as any,
			body: this._body,
			duplex: "half",
		} as any);
		return dummy.formData() as any;
	}

	get body(): ReadableStream | null {
		if (this._body !== null) {
			const body = this._body;
			return new ReadableStream({
				start(controller) {
					controller.enqueue(body);
					controller.close();
				},
			});
		}
		const nodeReq = this._nodeReq;
		return new ReadableStream({
			start(controller) {
				nodeReq.on("data", (chunk) => {
					controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				});
				nodeReq.on("end", () => {
					controller.close();
				});
				nodeReq.on("error", (err) => {
					controller.error(err);
				});
			},
		});
	}

	clone(): OgerNodeRequest {
		const cloned = new OgerNodeRequest(this._nodeReq, this._baseUrl, this._body);
		cloned._url = this._url;
		cloned._headers = this._headers;
		return cloned;
	}
}

if (typeof globalThis.Request !== "undefined") {
	try {
		Object.defineProperty(globalThis.Request, Symbol.hasInstance, {
			value(instance: any) {
				return instance && (instance.constructor?.name === "Request" || instance._isOgerNodeRequest);
			},
			configurable: true
		});
	} catch {
		// Ignore
	}
}

export { t };
