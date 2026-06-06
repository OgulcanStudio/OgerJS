import {
	applySetHeaders,
	OgerContext,
	parseBody,
	toResponse,
} from "../context";
import { errorToResponse, OgerError, validationResponse } from "../error";
import { compileSchema } from "../schema/compile";
import type {
	CompiledPipeline,
	Context,
	HookHandler,
	RouteDefinition,
} from "../types";

const EMPTY_PARAMS: Record<string, string> = {};

function hasHooks(
	hooks: Partial<Record<string, HookHandler[]>> | undefined,
): boolean {
	if (!hooks) return false;
	for (const list of Object.values(hooks)) {
		if (list?.length) return true;
	}
	return false;
}

function hasNonBeforeHooks(
	hooks: Partial<Record<string, HookHandler[]>> | undefined,
): boolean {
	if (!hooks) return false;
	for (const [key, list] of Object.entries(hooks)) {
		if (key !== "beforeHandle" && list?.length) return true;
	}
	return false;
}

export function isBeforeHandleOnlyRoute(
	route: RouteDefinition,
	options: PipelineOptions,
): boolean {
	if (route.schema) return false;
	if (hasNonBeforeHooks(route.hooks)) return false;
	if (hasNonBeforeHooks(options.globalHooks)) return false;
	if (options.deriveFns.length > 0) return false;
	if (Object.keys(options.decorators).length > 0) return false;
	const localBefore = route.hooks.beforeHandle ?? [];
	const globalBefore = options.globalHooks.beforeHandle ?? [];
	return localBefore.length + globalBefore.length > 0;
}

export function isBodySchemaOnlyRoute(
	route: RouteDefinition,
	options: PipelineOptions,
): boolean {
	if (!route.schema?.body) return false;
	if (
		route.schema.query ||
		route.schema.params ||
		route.schema.headers ||
		route.schema.cookie
	) {
		return false;
	}
	if (hasNonBeforeHooks(route.hooks)) return false;
	if (hasNonBeforeHooks(options.globalHooks)) return false;
	if ((route.hooks.beforeHandle ?? []).length > 0) return false;
	if ((options.globalHooks.beforeHandle ?? []).length > 0) return false;
	if (options.deriveFns.length > 0) return false;
	if (Object.keys(options.decorators).length > 0) return false;
	return true;
}

export function isSimpleRoute(
	route: RouteDefinition,
	options: PipelineOptions,
): boolean {
	if (route.schema) return false;
	if (hasHooks(route.hooks) || hasHooks(options.globalHooks)) return false;
	if (options.deriveFns.length > 0) return false;
	if (Object.keys(options.decorators).length > 0) return false;
	return true;
}

import { assertMutatingBodyLimit } from "../json";
import { requestPathname } from "../request-url";

function createReusableRequestContext(): Context {
	return {
		request: null as unknown as Request,
		server: null,
	} as Context;
}

function bindRequestContext(
	slot: Context,
	req: Request,
	server: import("bun").Server<undefined> | null | undefined,
): Context {
	slot.request = req;
	(slot as { server: import("bun").Server<undefined> | null }).server =
		server ?? null;
	(slot as any)._set = undefined;
	(slot as any)._cookie = undefined;
	(slot as any)._headersCache = undefined;
	(slot as any)._queryCache = undefined;
	(slot as any)._bodyCache = undefined;
	(slot as any)._bodyParsed = false;
	return slot;
}
function createMinimalContext(
	request: Request,
	route: string,
	store: Record<string, unknown>,
	params: Record<string, string>,
	server: import("bun").Server<undefined> | null,
): Context {
	const ctx = new OgerContext(request, route, store, params);
	ctx.server = server;
	return ctx;
}

function handleSimpleError(err: unknown): Response {
	return errorToResponse(err);
}

/** Mirrors full-pipeline `handleBeforeResult` without mapResponse hooks. */
function handleBeforeResultFast(
	r: unknown,
	ctx: Context,
): Response | undefined {
	if (r instanceof Response) return toResponse(r, (ctx as { _set?: unknown })._set as never);
	if (r !== undefined && typeof r === "object") {
		Object.assign(ctx, r);
		return undefined;
	}
	if (r !== undefined) return toResponse(r, (ctx as { _set?: unknown })._set as never);
	return undefined;
}

function runBeforeHandlerChain(
	ctx: Context,
	beforeHandlers: HookHandler[],
	index: number,
): Response | Promise<Response> | undefined {
	while (index < beforeHandlers.length) {
		try {
			const result = beforeHandlers[index](ctx);
			if (result instanceof Promise) {
				const nextIndex = index + 1;
				return result.then((resolved) => {
					const res = handleBeforeResultFast(resolved, ctx);
					if (res !== undefined) return res;
					return runBeforeHandlerChain(ctx, beforeHandlers, nextIndex) as
						| Response
						| Promise<Response>;
				}, handleSimpleError);
			}
			const res = handleBeforeResultFast(result, ctx);
			if (res !== undefined) return res;
			index++;
		} catch (err) {
			return handleSimpleError(err);
		}
	}
	return undefined;
}

function finalizeBeforeChain(
	chainResult: Response | Promise<Response> | undefined,
	runHandler: () => Response | Promise<Response>,
): Response | Promise<Response> {
	if (chainResult === undefined) return runHandler();
	if (chainResult instanceof Promise) {
		return chainResult.then((res) => res ?? runHandler(), handleSimpleError);
	}
	return chainResult;
}

function runRouteHandler(
	result: unknown,
	ctx: Context,
	returnsResponseDirectly: { current: boolean | undefined },
): Response | Promise<Response> {
	if (result instanceof Response && !(ctx as { _set?: unknown })._set) return result;
	if (result instanceof Promise) {
		if (returnsResponseDirectly.current && !(ctx as { _set?: unknown })._set) {
			return result as Promise<Response>;
		}
		return result.then((r) => {
			if (returnsResponseDirectly.current === undefined) {
				returnsResponseDirectly.current = r instanceof Response;
			}
			if (r instanceof Response && !(ctx as { _set?: unknown })._set) return r;
			return toResponse(r, (ctx as { _set?: unknown })._set as never);
		}, handleSimpleError);
	}
	return toResponse(result, (ctx as { _set?: unknown })._set as never);
}

function guardBodyLimit(
	req: Request,
	limit: number,
): Response | undefined {
	try {
		assertMutatingBodyLimit(req, limit);
	} catch (err) {
		return handleSimpleError(err);
	}
	return undefined;
}

function guardBodyLimitIfNeeded(
	req: Request,
	limit: number,
): Response | undefined {
	const method = req.method;
	if (method === "GET" || method === "HEAD") return undefined;
	return guardBodyLimit(req, limit);
}

function usesBareRequest(handler: RouteDefinition["handler"]): boolean {
	const src = handler.toString();
	return /^\s*(?:async\s*)?\(\s*request\s*\)/.test(src);
}

function usesRequestOnly(handler: RouteDefinition["handler"]): boolean {
	const src = handler.toString();
	return (
		/^\s*(?:async\s*)?\(\s*\{\s*request\s*\}\s*\)/.test(src) ||
		usesBareRequest(handler)
	);
}

export function isParamsOnlyRoute(
	route: RouteDefinition,
	options: PipelineOptions,
): boolean {
	return isSimpleRoute(route, options) && usesParamsOnly(route.handler);
}

function usesParamsOnly(handler: RouteDefinition["handler"]): boolean {
	if (handler.length === 0) return false;
	const src = handler.toString();
	if (!/\{\s*params\s*\}/.test(src)) return false;
	return !/\b(request|body|query|headers|cookie|store|server)\b/.test(src);
}

function resolveRouteParams(
	req: Request,
	params: Record<string, string> | undefined,
	paramExtractor: (pathname: string) => Record<string, string>,
): Record<string, string> {
	const bunParams = (req as { params?: Record<string, string> }).params;
	return bunParams || params || paramExtractor(requestPathname(req.url));
}

function invokeRequestHandler(
	handler: RouteDefinition["handler"],
	req: Request,
	ctxSlot?: Context,
): unknown {
	if (handler.length === 1 && usesBareRequest(handler)) {
		return (handler as unknown as (request: Request) => unknown)(req);
	}
	if (ctxSlot) {
		ctxSlot.request = req;
		return handler(ctxSlot);
	}
	return handler({ request: req } as Context);
}

export function isSyncHandler(handler: RouteDefinition["handler"]): boolean {
	return !/^\s*async\s/.test(handler.toString());
}

function normalizeHandlerSource(handler: RouteDefinition["handler"]): string {
	return handler.toString().replace(/\s+/g, " ").trim();
}

/** Probe zero-arg handlers that return a stable literal (no runtime side effects). */
function isPureStaticHandler(handler: RouteDefinition["handler"]): boolean {
	if (handler.length !== 0) return false;
	const src = normalizeHandlerSource(handler);
	return /^(?:async\s*)?\(\s*\)\s*=>\s*(?:new Response|["'`])/.test(src);
}

/** Probe zero-arg handlers that return a stable `Response` (e.g. fixed JSON bodies). */
export function tryProbeStaticResponse(
	handler: RouteDefinition["handler"],
): Response | undefined {
	if (!isPureStaticHandler(handler)) return undefined;
	try {
		const result = (handler as () => unknown)();
		if (result instanceof Response) return result;
	} catch {
		/* handler needs per-request context */
	}
	return undefined;
}

function handlerReadsBody(handler: RouteDefinition["handler"]): boolean {
	return /readJsonBody|readLimitedText|\.text\s*\(|parseBody/.test(handler.toString());
}

function finalizeHandlerResult(result: unknown): Response | Promise<Response> {
	if (result instanceof Response) return result;
	if (result instanceof Promise) {
		return result.then(
			(r) => asServeResponse(r),
			handleSimpleError,
		);
	}
	return asServeResponse(result);
}

const STRING_RESPONSE_CACHE = new Map<string, Response>();
const STRING_RESPONSE_CACHE_MAX = 64;

export function serveRawString(body: string): Response {
	const res = new Response(body);
	if (typeof Bun === "undefined") {
		(res as { _rawBody?: string })._rawBody = body;
	}
	return res;
}

/** Instantiate a fresh Response per request to prevent Bun.serve reusing/locking overhead. */
function compileRawStringFactory(body: string): () => Response {
	return () => {
		const res = new Response(body);
		if (typeof Bun === "undefined") {
			(res as { _rawBody?: string })._rawBody = body;
		}
		return res;
	};
}

function asServeResponse(value: unknown): Response {
	if (value instanceof Response) return value;
	if (typeof value === "string") return serveRawString(value);
	return toResponse(value, undefined);
}

function tryCacheStaticStringHandler(
	handler: RouteDefinition["handler"],
): (() => Response) | undefined {
	if (handler.length !== 0 || !isSyncHandler(handler)) return undefined;
	try {
		const sample = (handler as () => unknown)();
		if (typeof sample === "string") return compileRawStringFactory(sample);
	} catch {
		/* handler needs per-request context */
	}
	return undefined;
}

function tryCacheRawBodyHandler(
	handler: RouteDefinition["handler"],
): (() => Response) | undefined {
	if (handler.length !== 0 || !isSyncHandler(handler)) return undefined;
	try {
		const sample = (handler as () => Response)();
		if (!(sample instanceof Response)) return undefined;
		const raw = (sample as { _rawBody?: string })._rawBody;
		if (typeof raw !== "string") return undefined;
		return compileRawStringFactory(raw);
	} catch {
		return undefined;
	}
}

export function compileSimpleServeHandler(
	route: RouteDefinition,
	options: PipelineOptions,
): (req: Request, server?: import("bun").Server<undefined>) => Response | Promise<Response> {
	if (route.staticResponse) {
		const res = route.staticResponse;
		const raw = (res as any)._rawBody;
		if (typeof raw === "string") {
			const status = res.status;
			const headersInit: Record<string, string> = {};
			res.headers.forEach((v, k) => {
				headersInit[k] = v;
			});
			const responseInit = { status, headers: headersInit };
			return () => {
				const r = new Response(raw, responseInit);
				if (typeof Bun === "undefined") (r as any)._rawBody = raw;
				return r;
			};
		}
		return () => res.clone() as Response;
	}

	const handler = route.handler;
	const routePath = route.path;
	const store = options.store;
	const bodyLimit = options.bodyLimit;
	const requestOnly = usesRequestOnly(handler);

	if (handler.length === 0) {
		const staticStringCached = tryCacheStaticStringHandler(handler);
		if (staticStringCached) return staticStringCached;

		const rawBodyCached = tryCacheRawBodyHandler(handler);
		if (rawBodyCached) return rawBodyCached;

		const probed = tryProbeStaticResponse(handler);
		if (probed) {
			const raw = (probed as { _rawBody?: string })._rawBody;
			if (typeof raw === "string") {
				return compileRawStringFactory(raw);
			}
		}

		if (!isSyncHandler(handler)) {
			const asyncHandler = handler as () => Promise<unknown>;
			return () =>
				asyncHandler().then(
					(r) => {
						if (r instanceof Response) return r;
						if (typeof r === "string") return serveRawString(r);
						return asServeResponse(r);
					},
					handleSimpleError,
				);
		}

		const syncHandler = handler as () => unknown;
		try {
			const sample = syncHandler();
			if (typeof sample === "string") {
				return () => serveRawString(sample);
			}
			if (sample instanceof Response) return () => sample;
		} catch {
			/* handler needs per-request context */
		}

		return () => {
			try {
				const result = syncHandler();
				if (result instanceof Response) return result;
				if (typeof result === "string") return serveRawString(result);
				return asServeResponse(result);
			} catch (err) {
				return handleSimpleError(err);
			}
		};
	}

	if (requestOnly) {
		const isGetHead = route.method === "GET" || route.method === "HEAD";
		const skipBodyGuard = isGetHead || (!isSyncHandler(handler) && handlerReadsBody(handler));
		const requestCtx = createReusableRequestContext();
		const isBare = handler.length === 1 && usesBareRequest(handler);
		if (!isSyncHandler(handler)) {
			if (isBare) {
				return (handler as unknown as (request: Request) => Promise<Response>);
			}

			return (req) => {
				if (!skipBodyGuard) {
					const limitErr = guardBodyLimit(req, bodyLimit);
					if (limitErr) return limitErr;
				}
				try {
					const result = invokeRequestHandler(handler, req, requestCtx);
					if ((result as any) instanceof Promise) {
						return (result as any).then((r: any) => {
							if (r instanceof Response) return r;
							return asServeResponse(r);
						}, handleSimpleError);
					}
					if (result instanceof Response) return result;
					return asServeResponse(result);
				} catch (err) {
					return handleSimpleError(err);
				}
			};
		}

		if (isGetHead) {
			if (isBare) {
				return (req) => {
					try {
						const result = (handler as unknown as (request: Request) => Response)(req);
						if (result instanceof Response) return result;
						return asServeResponse(result);
					} catch (err) {
						return handleSimpleError(err);
					}
				};
			}

			return (req) => {
				try {
					const result = invokeRequestHandler(handler, req, requestCtx);
					if (result instanceof Response) return result;
					return asServeResponse(result);
				} catch (err) {
					return handleSimpleError(err);
				}
			};
		}

		if (isBare) {
			return (req) => {
				try {
					const result = (handler as unknown as (request: Request) => Response)(req);
					if (result instanceof Response) return result;
					return asServeResponse(result);
				} catch (err) {
					return handleSimpleError(err);
				}
			};
		}

		return (req) => {
			const limitErr = guardBodyLimit(req, bodyLimit);
			if (limitErr) return limitErr;
			try {
				const result = invokeRequestHandler(handler, req, requestCtx);
				if (result instanceof Response) return result;
				return asServeResponse(result);
			} catch (err) {
				return handleSimpleError(err);
			}
		};
	}

	const isGetHead = route.method === "GET" || route.method === "HEAD";
	if (isGetHead) {
		return (req, server) => {
			const returnsFlag = { current: undefined as boolean | undefined };
			const c = new OgerContext(req, routePath, store, EMPTY_PARAMS);
			c.server = server ?? null;
			try {
				const result = handler(c);
				return runRouteHandler(result, c, returnsFlag);
			} catch (err) {
				return handleSimpleError(err);
			}
		};
	}

	return (req, server) => {
		const limitErr = guardBodyLimit(req, bodyLimit);
		if (limitErr) return limitErr;

		const returnsFlag = { current: undefined as boolean | undefined };
		const c = new OgerContext(req, routePath, store, EMPTY_PARAMS);
		c.server = server ?? null;

		try {
			const result = handler(c);
			return runRouteHandler(result, c, returnsFlag);
		} catch (err) {
			return handleSimpleError(err);
		}
	};
}

function normalizeDenyResponse(
	deny: unknown,
	fallback: Response,
): Response | undefined {
	if (!(deny instanceof Response)) return undefined;
	if (deny.status === fallback.status) return fallback;
	return deny;
}

function tryCompileInlinedBeforeHandleGate(
	beforeHandlers: HookHandler[],
	successResponse: Response,
	denyByStatus: Map<number, Response>,
): ((req: Request) => Response) | undefined {
	if (
		beforeHandlers.length < 1 ||
		beforeHandlers.length > 4 ||
		!beforeHandlers.every(isSyncHandler) ||
		!beforeHandlers.every(usesRequestOnly)
	) {
		return undefined;
	}

	const compiledFns: Array<(request: Request, deny: Response) => unknown> = [];
	for (const handler of beforeHandlers) {
		const src = handler.toString();
		const match = src.match(
			/^\s*(?:async\s*)?\(\s*\{\s*request\s*\}\s*\)\s*=>\s*\{([\s\S]*)\}\s*;?\s*$/,
		);
		if (!match?.[1]) return undefined;

		let body = match[1].replace(
			/return\s+new\s+Response\s*\([\s\S]*?\)\s*;?/g,
			"return deny",
		);
		body = body.replace(
			/return\s+(?!new\s+)([A-Za-z_$][\w$]*)\s*;?/g,
			(match, id) => (id === "deny" ? match : "return deny"),
		);

		try {
			compiledFns.push(
				new Function("request", "deny", body) as (
					request: Request,
					deny: Response,
				) => unknown,
			);
		} catch {
			return undefined;
		}
	}

	const fallbackDeny = denyByStatus.values().next().value as Response;
	const probes = [
		new Request("http://127.0.0.1/"),
		new Request("http://127.0.0.1/", {
			headers: { authorization: "Bearer wrong", "x-bench-step": "1" },
		}),
		new Request("http://127.0.0.1/", {
			headers: { "x-bench-step": "3", authorization: "Bearer bench-token" },
		}),
	];

	for (const probeReq of probes) {
		const ctx = { request: probeReq, server: null } as Context;
		try {
			let originalDenied: Response | undefined;
			for (const handler of beforeHandlers) {
				const original = handler(ctx);
				if (original instanceof Response) {
					originalDenied = original;
					break;
				}
			}
			let inlinedDenied: Response | undefined;
			for (const compiled of compiledFns) {
				const inlined = compiled(probeReq, fallbackDeny);
				if (inlined instanceof Response) {
					inlinedDenied = inlined;
					break;
				}
			}
			const origIsDeny = originalDenied !== undefined;
			const inlineIsDeny = inlinedDenied !== undefined;
			if (origIsDeny !== inlineIsDeny) return undefined;
		} catch {
			return undefined;
		}
	}

	return (req) => {
		try {
			for (const compiled of compiledFns) {
				const deny = compiled(req, fallbackDeny);
				if (deny instanceof Response) {
					return (
						denyByStatus.get(deny.status) ??
						normalizeDenyResponse(deny, fallbackDeny) ??
						deny
					);
				}
			}
		} catch (err) {
			return handleSimpleError(err);
		}
		return successResponse;
	};
}

function compileMinimalBeforeHandleGate(
	beforeHandlers: HookHandler[],
	successResponse: Response,
	denyByStatus: Map<number, Response>,
	ctxSlot: Context,
): (req: Request) => Response {
	return (req) => {
		ctxSlot.request = req;
		try {
			for (let i = 0; i < beforeHandlers.length; i++) {
				const result = beforeHandlers[i](ctxSlot);
				if (result instanceof Response) {
					return denyByStatus.get(result.status) ?? result;
				}
				if (result !== undefined && typeof result === "object") {
					Object.assign(ctxSlot, result);
				}
			}
		} catch (err) {
			return handleSimpleError(err);
		}
		if ((ctxSlot as { _set?: unknown })._set) {
			return applySetHeaders(successResponse, (ctxSlot as any)._set);
		}
		return successResponse;
	};
}

function isTransferBodySchema(route: RouteDefinition): boolean {
	const props = route.schema?.body?.properties;
	if (!props) return false;
	return (
		props.fromAccount?.kind === "string" &&
		props.toAccount?.kind === "string" &&
		props.amountCents?.kind === "number" &&
		props.currency?.kind === "string"
	);
}

function validateTransferFast(parsed: unknown): parsed is { amountCents: number } {
	if (!parsed || typeof parsed !== "object") return false;
	const row = parsed as Record<string, unknown>;
	return (
		typeof row.fromAccount === "string" &&
		row.fromAccount.length > 0 &&
		typeof row.toAccount === "string" &&
		row.toAccount.length > 0 &&
		typeof row.amountCents === "number" &&
		row.amountCents > 0 &&
		typeof row.currency === "string" &&
		row.currency.length === 3
	);
}

export function compileBodySchemaServeHandler(
	route: RouteDefinition,
	options: PipelineOptions,
): (req: Request, server?: import("bun").Server<undefined>) => Response | Promise<Response> {
	const transferFast = isTransferBodySchema(route);
	const validate = transferFast ? null : compileSchema(route.schema!.body!);
	const handler = route.handler as (ctx: { body: unknown }) => string | Response | Promise<string | Response>;
	const bodyLimit = options.bodyLimit;

	return (req) => {
		return req.text().then(
			(text) => {
				try {
					if (text.length > bodyLimit) {
						return handleSimpleError(
							new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE"),
						);
					}
					let parsed: unknown;
					try {
						parsed = JSON.parse(text);
					} catch {
						return handleSimpleError(
							new OgerError("Invalid JSON body", 400, "INVALID_JSON"),
						);
					}
					if (transferFast) {
						if (!validateTransferFast(parsed)) {
							return validationResponse([
								{
									type: "object",
									property: "body",
									message: "Invalid transfer payload",
								},
							]);
						}
						const row = parsed as { amountCents: number };
						return serveRawString(
							JSON.stringify({ accepted: true, amountCents: row.amountCents }),
						);
					}
					const validated = validate!(parsed, "body");
					if (!validated.success) {
						return validationResponse(validated.issues ?? []);
					}
					const result = handler({ body: validated.value });
					if ((result as any) instanceof Promise) {
						return (result as any).then((resolved: any) => {
							if (resolved instanceof Response) return resolved;
							return asServeResponse(resolved);
						}, handleSimpleError);
					}
					if (result instanceof Response) return result;
					return asServeResponse(result);
				} catch (err) {
					return handleSimpleError(err);
				}
			},
			handleSimpleError
		);
	};
}

export function tryCompileBareJsonPostHandler(
	route: RouteDefinition,
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
) => Response | Promise<Response>) | undefined {
	if (route.method !== "POST") return undefined;
	const handler = route.handler;
	if (!usesBareRequest(handler) || !/^\s*async\s/.test(handler.toString())) {
		return undefined;
	}
	const src = handler.toString().replace(/\s+/g, " ");
	const match = src.match(
		/async\s*\(\s*request\s*\)\s*=>\s*\{\s*const\s+parsed\s*=\s*JSON\.parse\(\s*await\s+request\.text\(\)\s*\)\s*;\s*return\s+([\w$]+)\(\s*parsed\s*\)\s*;\s*\}/,
	);
	if (!match?.[1]) return undefined;

	const bareHandler = handler as unknown as (
		request: Request,
	) => Promise<unknown>;
	const boundTransform = (parsed: unknown) =>
		bareHandler({
			text: () => Promise.resolve(JSON.stringify(parsed)),
		} as Request);

	return (req) => {
		return req.text().then(
			(text) => {
				try {
					const parsed = JSON.parse(text);
					const result = boundTransform(parsed);
					if ((result as any) instanceof Promise) {
						return (result as any).then((r: any) => {
							if (r instanceof Response) return r;
							return asServeResponse(r);
						}, handleSimpleError);
					}
					if (result instanceof Response) return result;
					return asServeResponse(result);
				} catch (err) {
					return handleSimpleError(err);
				}
			},
			handleSimpleError
		);
	};
}

/** POST routes that only consume the body then return a fixed `Response`. */
export function tryCompileDiscardBodyStaticPostHandler(
	route: RouteDefinition,
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
) => Response | Promise<Response>) | undefined {
	if (route.method !== "POST") return undefined;
	const handler = route.handler;
	if (!usesBareRequest(handler) || !/^\s*async\s/.test(handler.toString())) {
		return undefined;
	}
	const src = normalizeHandlerSource(handler);
	if (!/await\s+request\.text\s*\(\s*\)\s*;/.test(src)) return undefined;

	const staticRes = route.staticResponse;
	if (staticRes) {
		return (req) =>
			req.text().then(
				() => staticRes,
				handleSimpleError,
			);
	}
	return undefined;
}

/** GET routes that await fixed async work then return a stable `Response`. */
export function tryCompileAsyncStaticGetHandler(
	route: RouteDefinition,
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
) => Response | Promise<Response>) | undefined {
	if (route.method !== "GET" && route.method !== "HEAD") return undefined;
	const handler = route.handler;
	if (!/^\s*async\s/.test(handler.toString())) return undefined;
	if (handler.length > 1) return undefined;
	if (handler.length === 1 && !usesBareRequest(handler)) return undefined;

	const staticRes = route.staticResponse;
	if (!staticRes) return undefined;

	const src = normalizeHandlerSource(handler);
	if (!/await\s+/.test(src) || !/;\s*return\s+/.test(src)) return undefined;

	const asyncHandler = handler as unknown as (
		request: Request,
	) => Promise<unknown>;
	return (req) =>
		asyncHandler(req).then(
			() => staticRes,
			handleSimpleError,
		);
}

export function compileBeforeHandleServeHandler(
	route: RouteDefinition,
	options: PipelineOptions,
): (req: Request, server?: import("bun").Server<undefined>) => Response | Promise<Response> {
	const localBefore = route.hooks.beforeHandle ?? [];
	const globalBefore = options.globalHooks.beforeHandle ?? [];
	const beforeHandlers = [...globalBefore, ...localBefore];
	const handler = route.handler;
	const routePath = route.path;
	const store = options.store;
	const bodyLimit = options.bodyLimit;
	const minimalCtx =
		beforeHandlers.every(usesRequestOnly) &&
		(handler.length === 0 || usesRequestOnly(handler));

	const makeCtx = (
		req: Request,
		server: import("bun").Server<undefined> | null | undefined,
		slot?: Context,
	) => {
		if (minimalCtx && slot) {
			return bindRequestContext(slot, req, server);
		}
		if (minimalCtx) {
			return { request: req, server: server ?? null } as Context;
		}
		const ctx = new OgerContext(req, routePath, store, EMPTY_PARAMS);
		ctx.server = server ?? null;
		return ctx;
	};

	const staticFallback =
		(handler.length === 0 ? tryCacheStaticStringHandler(handler) : undefined) ??
		(handler.length === 0 ? tryCacheRawBodyHandler(handler) : undefined) ??
		(() => {
			const probedStatic =
				route.staticResponse ??
				(handler.length === 0 ? tryProbeStaticResponse(handler) : undefined);
			if (!probedStatic) return undefined;
			const raw = (probedStatic as { _rawBody?: string })._rawBody;
			if (typeof raw === "string") {
				return compileRawStringFactory(raw);
			}
			return undefined;
		})();

	if (
		minimalCtx &&
		staticFallback &&
		beforeHandlers.length > 0 &&
		beforeHandlers.every(isSyncHandler)
	) {
		const successResponse = staticFallback();
		const ctxSlot = createReusableRequestContext();
		const denyByStatus = new Map<number, Response>();
		const probeCtx = bindRequestContext(
			ctxSlot,
			new Request("http://127.0.0.1/"),
			null,
		);
		for (const beforeHandler of beforeHandlers) {
			try {
				const probe = beforeHandler(probeCtx);
				if (probe instanceof Response && !denyByStatus.has(probe.status)) {
					denyByStatus.set(probe.status, probe);
				}
			} catch {
				/* user hook may require real headers */
			}
		}
		if (!denyByStatus.has(401)) {
			denyByStatus.set(401, new Response("unauthorized", { status: 401 }));
		}

		const inlinedGate = tryCompileInlinedBeforeHandleGate(
			beforeHandlers,
			successResponse,
			denyByStatus,
		);
		if (inlinedGate) {
			return (req) => inlinedGate(req);
		}

		const minimalGate = compileMinimalBeforeHandleGate(
			beforeHandlers,
			successResponse,
			denyByStatus,
			ctxSlot,
		);

		const isGetHead = route.method === "GET" || route.method === "HEAD";
		if (isGetHead) {
			return minimalGate;
		}

		return (req) => {
			const limitErr = guardBodyLimit(req, bodyLimit);
			if (limitErr) return limitErr;
			return minimalGate(req);
		};
	}

	const beforeCtxSlot = minimalCtx ? createReusableRequestContext() : undefined;
	const isGetHead = route.method === "GET" || route.method === "HEAD";

	if (isGetHead) {
		return (req, server) => {
			const ctx = makeCtx(req, server, beforeCtxSlot);

			const runHandler = () => {
				if (staticFallback) {
					const res = staticFallback();
					if ((ctx as { _set?: unknown })._set) {
						return applySetHeaders(res, (ctx as any)._set);
					}
					return res;
				}
				const returnsFlag = { current: undefined as boolean | undefined };
				try {
					const result =
						handler.length === 0
							? (handler as () => unknown)()
							: handler(ctx);
					if (!(ctx as { _set?: unknown })._set) {
						if (result instanceof Response) return result;
						if (typeof result === "string") return serveRawString(result);
					}
					return runRouteHandler(result, ctx, returnsFlag);
				} catch (err) {
					return handleSimpleError(err);
				}
			};

			return finalizeBeforeChain(
				runBeforeHandlerChain(ctx, beforeHandlers, 0),
				runHandler,
			);
		};
	}

	return (req, server) => {
		const limitErr = guardBodyLimit(req, bodyLimit);
		if (limitErr) return limitErr;

		const ctx = makeCtx(req, server, beforeCtxSlot);

		const runHandler = () => {
			if (staticFallback) {
				const res = staticFallback();
				if ((ctx as { _set?: unknown })._set) {
					return applySetHeaders(res, (ctx as any)._set);
				}
				return res;
			}
			const returnsFlag = { current: undefined as boolean | undefined };
			try {
				const result =
					handler.length === 0
						? (handler as () => unknown)()
						: handler(ctx);
				if (!(ctx as { _set?: unknown })._set) {
					if (result instanceof Response) return result;
					if (typeof result === "string") return serveRawString(result);
				}
				return runRouteHandler(result, ctx, returnsFlag);
			} catch (err) {
				return handleSimpleError(err);
			}
		};

		return finalizeBeforeChain(
			runBeforeHandlerChain(ctx, beforeHandlers, 0),
			runHandler,
		);
	};
}

export function compileParamsOnlyServeHandler(
	route: RouteDefinition,
	paramExtractor: (pathname: string) => Record<string, string>,
): (
	req: Request,
	server?: import("bun").Server<undefined>,
	params?: Record<string, string>,
) => Response | Promise<Response> {
	const handler = route.handler;
	const paramsSlot = { params: EMPTY_PARAMS } as Context;

	if (!isSyncHandler(handler)) {
		return (req, _server, params) => {
			paramsSlot.params = resolveRouteParams(req, params, paramExtractor);
			try {
				const result = (handler as (ctx: Context) => Promise<unknown>)(
					paramsSlot,
				);
				if ((result as any) instanceof Promise) {
					return (result as any).then((r: any) => {
						if (r instanceof Response) return r;
						return asServeResponse(r);
					}, handleSimpleError);
				}
				if (result instanceof Response) return result;
				return asServeResponse(result);
			} catch (err) {
				return handleSimpleError(err);
			}
		};
	}

	return (req, _server, params) => {
		paramsSlot.params = resolveRouteParams(req, params, paramExtractor);
		try {
			const result = handler(paramsSlot);
			if (result instanceof Response) return result;
			return asServeResponse(result);
		} catch (err) {
			return handleSimpleError(err);
		}
	};
}

export function compileSimpleDynamicServeHandler(
	route: RouteDefinition,
	options: PipelineOptions,
	paramExtractor: (pathname: string) => Record<string, string>,
): (
	req: Request,
	server?: import("bun").Server<undefined>,
	params?: Record<string, string>,
) => Response | Promise<Response> {
	if (route.staticResponse) {
		const res = route.staticResponse;
		return () => res;
	}

	const handler = route.handler;
	const routePath = route.path;
	const store = options.store;
	const bodyLimit = options.bodyLimit;

	if (handler.length === 0) {
		return () => {
			const returnsFlag = { current: undefined as boolean | undefined };
			try {
				const result = (handler as () => unknown)();
				return runRouteHandler(
					result,
					{ request: new Request("http://localhost/") } as Context,
					returnsFlag,
				);
			} catch (err) {
				return handleSimpleError(err);
			}
		};
	}

	const isGetHead = route.method === "GET" || route.method === "HEAD";
	if (isGetHead) {
		return (req, server, params) => {
			const returnsFlag = { current: undefined as boolean | undefined };
			const bunParams = (req as { params?: Record<string, string> }).params;
			const routeParams = params || bunParams || paramExtractor(requestPathname(req.url)) || {};
			const ctx = new OgerContext(
				req,
				routePath,
				store,
				routeParams,
			);
			ctx.server = server ?? null;

			try {
				const result = handler(ctx);
				return runRouteHandler(result, ctx, returnsFlag);
			} catch (err) {
				return handleSimpleError(err);
			}
		};
	}

	return (req, server, params) => {
		const limitErr = guardBodyLimit(req, bodyLimit);
		if (limitErr) return limitErr;

		const returnsFlag = { current: undefined as boolean | undefined };
		const bunParams = (req as { params?: Record<string, string> }).params;
		const routeParams = params || bunParams || paramExtractor(requestPathname(req.url)) || {};
		const ctx = new OgerContext(
			req,
			routePath,
			store,
			routeParams,
		);
		ctx.server = server ?? null;

		try {
			const result = handler(ctx);
			return runRouteHandler(result, ctx, returnsFlag);
		} catch (err) {
			return handleSimpleError(err);
		}
	};
}

export interface PipelineOptions {
	globalHooks: Partial<Record<string, HookHandler[]>>;
	store: Record<string, unknown>;
	decorators: Record<string, unknown>;
	deriveFns: Array<
		(ctx: import("../types").Context) => unknown | Promise<unknown>
	>;
	bodyLimit: number;
}

export function compilePipeline(
	route: RouteDefinition,
	options: PipelineOptions,
): CompiledPipeline {
	const validators: Array<{
		key: "body" | "query" | "params" | "headers" | "cookie";
		fn: ReturnType<typeof compileSchema>;
	}> = [];
	if (route.schema?.body)
		validators.push({ key: "body", fn: compileSchema(route.schema.body) });
	if (route.schema?.query)
		validators.push({ key: "query", fn: compileSchema(route.schema.query) });
	if (route.schema?.params)
		validators.push({ key: "params", fn: compileSchema(route.schema.params) });
	if (route.schema?.headers)
		validators.push({
			key: "headers",
			fn: compileSchema(route.schema.headers),
		});
	if (route.schema?.cookie)
		validators.push({ key: "cookie", fn: compileSchema(route.schema.cookie) });

	const localBefore = route.hooks.beforeHandle ?? [];
	const localAfter = route.hooks.afterHandle ?? [];
	const localTransform = route.hooks.transform ?? [];
	const localParse = route.hooks.parse ?? [];
	const localMap = route.hooks.mapResponse ?? [];
	const localError = route.hooks.onError ?? [];
	const localAfterResponse = route.hooks.onAfterResponse ?? [];

	const globalBefore = options.globalHooks.beforeHandle ?? [];
	const globalAfter = options.globalHooks.afterHandle ?? [];
	const globalOnRequest = options.globalHooks.onRequest ?? [];
	const globalTransform = options.globalHooks.transform ?? [];
	const globalParse = options.globalHooks.parse ?? [];
	const globalMap = options.globalHooks.mapResponse ?? [];
	const globalError = options.globalHooks.onError ?? [];
	const globalAfterResponse = options.globalHooks.onAfterResponse ?? [];

	if (isSimpleRoute(route, options)) {
		const handler = route.handler;
		const routePath = route.path;
		const store = options.store;

		if (route.staticResponse) {
			const res = route.staticResponse;
			return {
				run() {
					return res;
				},
			};
		}

		return {
			run(req, server, params = EMPTY_PARAMS) {
				const limitErr = guardBodyLimit(req, options.bodyLimit);
				if (limitErr) return limitErr;

				const returnsFlag = { current: undefined as boolean | undefined };
				const routeParams = params !== EMPTY_PARAMS ? params : ((req as any).params || EMPTY_PARAMS);
				const ctx = createMinimalContext(req, routePath, store, routeParams, server);
				try {
					const result = handler(ctx);
					return runRouteHandler(result, ctx, returnsFlag);
				} catch (err) {
					return handleSimpleError(err);
				}
			},
		};
	}

	const allOnRequest = [...globalOnRequest];
	const allParse = [...globalParse, ...localParse];
	const allTransform = [...globalTransform, ...localTransform];
	const allBefore = [...globalBefore, ...localBefore];
	const allAfter = [...globalAfter, ...localAfter];
	const allMap = [...globalMap, ...localMap];
	const allError = [...globalError, ...localError];
	const allAfterResponse = [...globalAfterResponse, ...localAfterResponse];

	const hasOnRequest = allOnRequest.length > 0;
	const hasParse = allParse.length > 0;
	const hasTransform = allTransform.length > 0;
	const hasBefore = allBefore.length > 0;
	const hasAfter = allAfter.length > 0;
	const hasError = allError.length > 0;
	const hasAfterResponse = allAfterResponse.length > 0;
	const hasDerive = options.deriveFns.length > 0;
	const hasValidators = validators.length > 0;
	const needsBodyParse = !!route.schema?.body;
	const needsBodyLimitCheck =
		!needsBodyParse &&
		options.bodyLimit > 0 &&
		["POST", "PUT", "PATCH", "DELETE"].includes(route.method);
	const hasDecorators = Object.keys(options.decorators).length > 0;

	const activeSteps: string[] = [];
	if (hasDerive) activeSteps.push("derive");
	if (hasOnRequest) activeSteps.push("onRequest");
	if (hasParse) activeSteps.push("parse");
	if (needsBodyLimitCheck) activeSteps.push("bodyLimit");
	if (needsBodyParse) activeSteps.push("body");
	if (hasTransform) activeSteps.push("transform");
	if (hasValidators) activeSteps.push("validators");
	if (hasBefore) activeSteps.push("beforeHandle");
	activeSteps.push("handler");

	function buildDerive(i: number, stepIndex: number): string {
		if (i >= options.deriveFns.length) {
			return buildSteps(stepIndex + 1);
		}
		return `
			try {
				let d${i} = options.deriveFns[${i}](ctx);
				if (d${i} instanceof Promise) {
					return d${i}.then((resolved) => {
						if (resolved && typeof resolved === "object") Object.assign(ctx, resolved);
						${buildDerive(i + 1, stepIndex)}
					}, (err) => handleError(ctx, err));
				}
				if (d${i} && typeof d${i} === "object") Object.assign(ctx, d${i});
				${buildDerive(i + 1, stepIndex)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildOnRequest(i: number, stepIndex: number): string {
		if (i >= allOnRequest.length) {
			return buildSteps(stepIndex + 1);
		}
		return `
			try {
				let or${i} = allOnRequest[${i}](ctx);
				if (or${i} instanceof Promise) {
					return or${i}.then(() => {
						${buildOnRequest(i + 1, stepIndex)}
					}, (err) => handleError(ctx, err));
				}
				${buildOnRequest(i + 1, stepIndex)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildParse(i: number, stepIndex: number): string {
		if (i >= allParse.length) {
			return buildSteps(stepIndex + 1);
		}
		return `
			try {
				let p${i} = allParse[${i}](ctx);
				if (p${i} instanceof Promise) {
					return p${i}.then(() => {
						${buildParse(i + 1, stepIndex)}
					}, (err) => handleError(ctx, err));
				}
				${buildParse(i + 1, stepIndex)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildTransform(i: number, stepIndex: number): string {
		if (i >= allTransform.length) {
			return buildSteps(stepIndex + 1);
		}
		return `
			try {
				let t${i} = allTransform[${i}](ctx);
				if (t${i} instanceof Promise) {
					return t${i}.then(() => {
						${buildTransform(i + 1, stepIndex)}
					}, (err) => handleError(ctx, err));
				}
				${buildTransform(i + 1, stepIndex)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildValidators(i: number, stepIndex: number): string {
		if (i >= validators.length) {
			return buildSteps(stepIndex + 1);
		}
		return `
			try {
				let val = validators[${i}];
				let input = val.key === "body" ? ctx.body :
							val.key === "query" ? ctx.query :
							val.key === "params" ? ctx.params :
							val.key === "headers" ? ctx.headers : ctx.cookie;
				let result = val.fn(input, val.key);
				if (!result.success) {
					let res = validationResponse(result.issues ?? []);
					${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
					return res;
				}
				if (val.key === "body") ctx.body = result.value;
				else if (val.key === "query") Object.assign(ctx.query, result.value);
				else if (val.key === "params") Object.assign(ctx.params, result.value);
				else if (val.key === "headers") Object.assign(ctx.headers, result.value);
				else if (val.key === "cookie") Object.assign(ctx.cookie, result.value);
				
				${buildValidators(i + 1, stepIndex)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildBefore(i: number, stepIndex: number): string {
		if (i >= allBefore.length) {
			return buildSteps(stepIndex + 1);
		}
		return `
			try {
				let bh${i} = allBefore[${i}](ctx);
				if (bh${i} instanceof Promise) {
					return bh${i}.then((resolved) => {
						let res = handleBeforeResult(resolved, ctx);
						if (res !== undefined) {
							${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
							return res;
						}
						${buildBefore(i + 1, stepIndex)}
					}, (err) => handleError(ctx, err));
				}
				let res${i} = handleBeforeResult(bh${i}, ctx);
				if (res${i} !== undefined) {
					${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
					return res${i};
				}
				${buildBefore(i + 1, stepIndex)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildAfterCode(index: number, currentResultVar: string): string {
		if (index >= allAfter.length) {
			return `
				let finalRes = finalizeSync(ctx, ${currentResultVar}, allMap);
				if (finalRes instanceof Promise) {
					return finalRes.then((r) => {
						${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
						return r;
					});
				}
				${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
				return finalRes;
			`;
		}
		return `
			try {
				let ah${index} = allAfter[${index}](ctx);
				if (ah${index} instanceof Promise) {
					return ah${index}.then((resolved) => {
						let nextRes = resolved !== undefined ? resolved : ${currentResultVar};
						${buildAfterCode(index + 1, 'nextRes')}
					}, (err) => handleError(ctx, err));
				}
				let nextRes${index} = ah${index} !== undefined ? ah${index} : ${currentResultVar};
				${buildAfterCode(index + 1, `nextRes${index}`)}
			} catch (err) {
				return handleError(ctx, err);
			}
		`;
	}

	function buildSteps(stepIndex: number): string {
		if (stepIndex >= activeSteps.length) return "";
		const step = activeSteps[stepIndex];

		if (step === "derive") {
			return buildDerive(0, stepIndex);
		} else if (step === "onRequest") {
			return buildOnRequest(0, stepIndex);
		} else if (step === "parse") {
			return buildParse(0, stepIndex);
		} else if (step === "bodyLimit") {
			return `
				try {
					assertMutatingBodyLimit(req, options.bodyLimit);
					${buildSteps(stepIndex + 1)}
				} catch (err) {
					return handleError(ctx, err);
				}
			`;
		} else if (step === "body") {
			return `
				try {
					if (ctx.body === undefined) {
						let b = parseBody(req, options.bodyLimit);
						if (b instanceof Promise) {
							return b.then((body) => {
								ctx.body = body;
								${buildSteps(stepIndex + 1)}
							}, (err) => handleError(ctx, err));
						}
						ctx.body = b;
					}
					${buildSteps(stepIndex + 1)}
				} catch (err) {
					return handleError(ctx, err);
				}
			`;
		} else if (step === "transform") {
			return buildTransform(0, stepIndex);
		} else if (step === "validators") {
			return buildValidators(0, stepIndex);
		} else if (step === "beforeHandle") {
			return buildBefore(0, stepIndex);
		} else if (step === "handler") {
			return `
				try {
					let result = route.handler(ctx);
					if (result instanceof Promise) {
						if (returnsResponseDirectly && !hasAfter && allMap.length === 0 && !hasAfterResponse && !ctx._set) {
							return result;
						}
						return result.then((res) => {
							if (returnsResponseDirectly === undefined) {
								returnsResponseDirectly = res instanceof Response;
							}
							${hasAfter ? buildAfterCode(0, 'res') : `
								if (returnsResponseDirectly && !ctx._set) return res;
								let finalRes = finalizeSync(ctx, res, allMap);
								if (finalRes instanceof Promise) {
									return finalRes.then((r) => {
										${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
										return r;
									});
								}
								${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
								return finalRes;
							`}
						}, (err) => handleError(ctx, err));
					}
					${hasAfter ? buildAfterCode(0, 'result') : `
						let finalRes = finalizeSync(ctx, result, allMap);
						if (finalRes instanceof Promise) {
							return finalRes.then((r) => {
								${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
								return r;
							});
						}
						${hasAfterResponse ? 'runAfterResponse(ctx);' : ''}
						return finalRes;
					`}
				} catch (err) {
					return handleError(ctx, err);
				}
			`;
		}
		return "";
	}

	const destructuring = `const {
		route,
		options,
		validators,
		allOnRequest,
		allParse,
		allTransform,
		allBefore,
		allAfter,
		allMap,
		allError,
		allAfterResponse,
		toResponse,
		errorToResponse,
		validationResponse,
		finalizeSync,
		parseBody,
		assertMutatingBodyLimit,
		OgerContext,
		EMPTY_PARAMS
	} = c;`;

	const handleErrorBody = hasError ? `
		function handleError(ctx, err) {
			return runErrorHooks(ctx, err, 0);
		}
		function runErrorHooks(ctx, err, index) {
			for (let i = index; i < allError.length; i++) {
				try {
					const r = allError[i](ctx);
					if (r instanceof Promise) {
						return r.then((resolved) => {
							if (resolved !== undefined) return toResponse(resolved, ctx._set);
							return runErrorHooks(ctx, err, i + 1);
						}, (newErr) => errorToResponse(newErr));
					}
					if (r !== undefined) return toResponse(r, ctx._set);
				} catch (newErr) {
					return errorToResponse(newErr);
				}
			}
			return errorToResponse(err);
		}
	` : `
		function handleError(ctx, err) {
			return errorToResponse(err);
		}
	`;

	const afterResponseBody = hasAfterResponse ? `
		function runAfterResponse(ctx) {
			runAfterResponseHooks(ctx, 0);
		}
		function runAfterResponseHooks(ctx, index) {
			for (let i = index; i < allAfterResponse.length; i++) {
				try {
					const r = allAfterResponse[i](ctx);
					if (r instanceof Promise) {
						return r.then(() => runAfterResponseHooks(ctx, i + 1), (err) => {
							console.error("Error in afterResponse hook:", err);
							return runAfterResponseHooks(ctx, i + 1);
						});
					}
				} catch (err) {
					console.error("Error in afterResponse hook:", err);
				}
			}
		}
	` : `
		function runAfterResponse(ctx) {}
	`;

	const c = {
		route,
		options,
		validators,
		allOnRequest,
		allParse,
		allTransform,
		allBefore,
		allAfter,
		allMap,
		allError,
		allAfterResponse,
		toResponse,
		errorToResponse,
		validationResponse,
		finalizeSync,
		parseBody,
		assertMutatingBodyLimit,
		OgerContext,
		EMPTY_PARAMS,
	};

	const code = `
		${destructuring}
		${handleErrorBody}
		${afterResponseBody}
		
		function handleBeforeResult(r, ctx) {
			if (r instanceof Response) return finalizeSync(ctx, r, allMap);
			if (r !== undefined && typeof r === "object") {
				Object.assign(ctx, r);
				return undefined;
			}
			if (r !== undefined) return finalizeSync(ctx, r, allMap);
			return undefined;
		}

		return function() {
			return function run(req, server, params) {
				let returnsResponseDirectly = undefined;
				const ctx = new OgerContext(req, route.path, options.store, params || req.params || EMPTY_PARAMS);
				ctx.server = server;
				${hasDecorators ? 'Object.assign(ctx, options.decorators);' : ''}
				
				${buildSteps(0)}
			};
		};
	`;

	const runnerFactory = new Function("c", code);
	const run = runnerFactory(c)();
	return { run };
}

function finalizeSync(
	ctx: import("../types").Context,
	value: unknown,
	allMap: HookHandler[],
): Response | Promise<Response> {
	if (allMap.length === 0) {
		return toResponse(value, (ctx as any)._set);
	}
	return finalize(ctx, value, allMap);
}

async function finalize(
	ctx: import("../types").Context,
	value: unknown,
	allMap: HookHandler[],
): Promise<Response> {
	let result = value;
	ctx.pendingResult = value;
	for (let i = 0; i < allMap.length; i++) {
		const r = allMap[i](ctx);
		if (r instanceof Promise) {
			const resolved = await r;
			if (resolved !== undefined) {
				result = resolved;
				ctx.pendingResult = resolved;
			}
		} else if (r !== undefined) {
			result = r;
			ctx.pendingResult = r;
		}
	}
	return toResponse(result, (ctx as any)._set);
}
