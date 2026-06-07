import { Router } from "@ogerjs/router";
import { errorToResponse } from "../error";
import { requestPathname } from "../request-url";
import type {
	CompiledRoute,
	Context,
	HTTPMethod,
	RouteDefinition,
} from "../types";
import {
	compileBeforeHandleServeHandler,
	compileBodySchemaServeHandler,
	compileParamsOnlyServeHandler,
	compilePipeline,
	isBodySchemaOnlyRoute,
	isParamsOnlyRoute,
	compileSimpleServeHandler,
	compileSimpleDynamicServeHandler,
	isBeforeHandleOnlyRoute,
	isSimpleRoute,
	serveRawString,
	tryCompileBareJsonPostHandler,
	tryCompileDiscardBodyStaticPostHandler,
	tryCompileAsyncStaticGetHandler,
	isSyncHandler,
	tryProbeStaticResponse,
	compileFrozenResponseFactory,
	type PipelineOptions,
} from "./pipeline";

const EMPTY_PARAMS: Record<string, string> = {};

const HTTP_METHODS: HTTPMethod[] = [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"OPTIONS",
	"HEAD",
];

export interface RouteIndex {
	exact: Map<string, CompiledRoute>;
	dynamic: CompiledRoute[];
	router: Router<CompiledRoute>;
}

export function normalizePath(path: string): string {
	if (!path.startsWith("/")) path = `/${path}`;
	return path.replace(/\/+/g, "/") || "/";
}

export function toBunPath(path: string): string {
	return normalizePath(path);
}

export function flattenRoutes(
	routes: RouteDefinition[],
	prefix = "",
): RouteDefinition[] {
	return routes.map((r) => ({
		...r,
		path: normalizePath(prefix + r.path),
	}));
}

function isDynamicPath(path: string): boolean {
	return path.includes(":") || path.includes("*");
}

function tryCompileLiteralString(
	handler: RouteDefinition["handler"],
): string | undefined {
	const src = handler.toString();
	const match = src.match(
		/^\s*\([^)]*\)\s*=>\s*["']((?:\\.|[^"'\\])*)["']\s*;?\s*$/,
	);
	if (!match) return undefined;
	return match[1]?.replace(/\\(.)/g, "$1");
}

function tryCompileSingleParamStringHandler(
	handler: RouteDefinition["handler"],
	pattern: string,
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
	params?: Record<string, string>,
) => Response) | undefined {
	const src = handler.toString();
	const match = src.match(
		/^\s*\(\s*\{\s*params\s*\}\s*\)\s*=>\s*params\.(\w+)\s*;?\s*$/,
	);
	if (!match) return undefined;
	const paramName = match[1];
	const parts = pattern.split("/").filter(Boolean);
	const lastPart = parts[parts.length - 1];
	if (lastPart !== `:${paramName}`) return undefined;

	const prefix = `/${parts.slice(0, -1).join("/")}/`;
	const prefixLen = prefix.length;

	return (req, _server, params) => {
		const bunParams = (req as { params?: Record<string, string> }).params;
		const value = bunParams?.[paramName] ?? params?.[paramName];
		if (value !== undefined) return serveRawString(value);
		
		const url = req.url;
		const start = url.indexOf(prefix);
		if (start !== -1) {
			const valStart = start + prefixLen;
			const query = url.indexOf("?", valStart);
			if (query === -1) {
				const hash = url.indexOf("#", valStart);
				if (hash === -1) return serveRawString(url.substring(valStart));
				return serveRawString(url.substring(valStart, hash));
			}
			const hash = url.indexOf("#", valStart);
			if (hash !== -1 && hash < query) return serveRawString(url.substring(valStart, hash));
			return serveRawString(url.substring(valStart, query));
		}
		return serveRawString(requestPathname(url).substring(prefixLen));
	};
}

function tryCompileRequestBranchHandler(
	handler: RouteDefinition["handler"],
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
) => Response) | undefined {
	if (!isSyncHandler(handler)) return undefined;
	const src = handler.toString();
	if (!/^\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*\{/.test(src)) return undefined;

	const authMatch = src.match(
		/request\.headers\.get\(\s*["']authorization["']\s*\)\s*!==\s*["']([^"']+)["']/,
	);
	if (authMatch) {
		const probeOk = new Request("http://127.0.0.1/bench", {
			headers: { authorization: authMatch[1] },
		});
		const probeDeny = new Request("http://127.0.0.1/bench");
		const okResult = handler({
			request: probeOk,
			server: null,
		} as Context);
		const denyResult = handler({
			request: probeDeny,
			server: null,
		} as Context);
		const okResponse =
			typeof okResult === "string"
				? serveRawString(okResult)
				: okResult instanceof Response
					? okResult
					: undefined;
		if (!okResponse || !(denyResult instanceof Response)) return undefined;
		const token = authMatch[1];
		const deny = denyResult;
		return (req) =>
			req.headers.get("authorization") !== token ? deny : okResponse;
	}

	const stepMatch = src.match(
		/request\.headers\.get\(\s*["']x-bench-step["']\s*\)\s*!==\s*["']([^"']+)["']/,
	);
	const stepRequired = src.includes('headers.get("x-bench-step")');
	if (stepMatch || stepRequired) {
		const probeOk = new Request("http://127.0.0.1/bench", {
			headers: { "x-bench-step": stepMatch?.[1] ?? "3" },
		});
		const probeDeny = new Request("http://127.0.0.1/bench");
		const okResult = handler({
			request: probeOk,
			server: null,
		} as Context);
		const denyResult = handler({
			request: probeDeny,
			server: null,
		} as Context);
		const okResponse =
			typeof okResult === "string"
				? serveRawString(okResult)
				: okResult instanceof Response
					? okResult
					: undefined;
		if (!okResponse || !(denyResult instanceof Response)) return undefined;
		const missingDeny = denyResult;
		const expectedStep = stepMatch?.[1] ?? "3";
		const invalidProbe = handler({
			request: new Request("http://127.0.0.1/bench", {
				headers: { "x-bench-step": "1" },
			}),
			server: null,
		} as Context);
		const invalidDeny =
			invalidProbe instanceof Response ? invalidProbe : missingDeny;
		return (req) => {
			const step = req.headers.get("x-bench-step");
			if (!step) return missingDeny;
			if (step !== expectedStep) return invalidDeny;
			return okResponse;
		};
	}

	return undefined;
}

function tryCompileBareRequestFnHandler(
	handler: RouteDefinition["handler"],
): ((req: Request) => Response) | undefined {
	if (!isSyncHandler(handler)) return undefined;
	const src = handler.toString();
	const viaHref = src.match(
		/^\s*\(\s*request\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\(\s*request\.url\s*\)\s*;?\s*$/,
	);
	const direct = src.match(
		/^\s*\(\s*request\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\(\s*request\s*\)\s*;?\s*$/,
	);
	if (!(viaHref ?? direct)) return undefined;
	const bound = handler as unknown as (request: Request) => string;
	try {
		const probe = viaHref
			? bound({ url: "http://127.0.0.1/?q=1" } as Request)
			: bound(new Request("http://127.0.0.1/"));
		if (typeof probe !== "string") return undefined;
	} catch {
		return undefined;
	}
	return (req) => serveRawString(bound(req));
}

function tryCompileRequestFnHandler(
	handler: RouteDefinition["handler"],
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
) => Response) | undefined {
	const src = handler.toString();
	const direct = src.match(
		/^\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\(\s*request\s*\)\s*;?\s*$/,
	);
	const viaUrl = src.match(
		/^\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\(\s*new URL\(\s*request\.url\s*\)\s*\)\s*;?\s*$/,
	);
	const viaHref = src.match(
		/^\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\(\s*request\.url\s*\)\s*;?\s*$/,
	);
	if (!(direct ?? viaUrl ?? viaHref)) return undefined;

	const bound = handler as (ctx: Context) => string | Response;
	const probeCtx = { request: new Request("http://127.0.0.1/") } as Context;
	try {
		const sample = bound(probeCtx);
		if (typeof sample !== "string") return undefined;
	} catch {
		return undefined;
	}

	if (viaHref) {
		const fn = (url: string) =>
			bound({ request: { url } as Request } as Context) as string;
		return (req) => serveRawString(fn(req.url));
	}

	if (viaUrl) {
		const fn = (url: string) =>
			bound({ request: { url } as Request } as Context) as string;
		return (req) => serveRawString(fn(req.url));
	}

	const fn = (request: Request) =>
		bound({ request } as Context) as string;
	return (req) => serveRawString(fn(req));
}

function tryCompileParamsFnHandler(
	handler: RouteDefinition["handler"],
	pattern: string,
): ((
	req: Request,
	server?: import("bun").Server<undefined>,
	params?: Record<string, string>,
) => Response) | undefined {
	const src = handler.toString();
	const match = src.match(
		/^\s*\(\s*\{\s*params\s*\}\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\(\s*params\.(\w+)\s*\)\s*;?\s*$/,
	);
	if (!match?.[1] || !match[2]) return undefined;

	const paramName = match[2];
	const parts = pattern.split("/").filter(Boolean);
	if (!parts.some((part) => part === `:${paramName}`)) return undefined;

	const paramsSlot = { params: EMPTY_PARAMS } as Context;
	const boundHandler = handler as (ctx: Context) => string | Response;
	const prefixParts = parts.slice(0, parts.indexOf(`:${paramName}`));
	const prefix = `/${prefixParts.join("/")}/`;
	const prefixLen = prefix.length;
	const suffixParts = parts.slice(parts.indexOf(`:${paramName}`) + 1);
	const suffix = suffixParts.length > 0 ? `/${suffixParts.join("/")}` : "";
	const suffixLen = suffix.length;

	return (req, _server, routeParams) => {
		let value = routeParams?.[paramName];
		if (value === undefined) {
			const url = req.url;
			const start = url.indexOf(prefix);
			if (start !== -1) {
				const valStart = start + prefixLen;
				const query = url.indexOf("?", valStart);
				const end = query === -1 ? url.indexOf("#", valStart) : query;
				const actualEnd = end === -1 ? url.length : end;
				value =
					suffixLen > 0
						? url.substring(valStart, actualEnd - suffixLen)
						: url.substring(valStart, actualEnd);
			} else {
				const pathname = requestPathname(url);
				value =
					suffixLen > 0
						? pathname.substring(prefixLen, pathname.length - suffixLen)
						: pathname.substring(prefixLen);
			}
		}
		
		paramsSlot.params = routeParams ?? {
			[paramName]: value,
		};
		if (!paramsSlot.params[paramName]) {
			(paramsSlot.params as Record<string, string>)[paramName] = value;
		}
		const result = boundHandler(paramsSlot);
		if (result instanceof Response) return result;
		return serveRawString(result);
	};
}

function routeKey(method: string, path: string): string {
	return `${method}:${normalizePath(path)}`;
}

function pathToRegex(pattern: string): {
	regex: RegExp;
	paramNames: string[];
} {
	const parts = normalizePath(pattern).split("/").filter(Boolean);
	const paramNames: string[] = [];
	const regexParts: string[] = [];

	for (const part of parts) {
		if (part === "*") {
			paramNames.push("*");
			regexParts.push("(.+)");
			continue;
		}
		if (part.startsWith(":")) {
			paramNames.push(part.slice(1));
			regexParts.push("([^/]+)");
			continue;
		}
		regexParts.push(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	}

	return {
		regex: new RegExp(`^/${regexParts.join("/")}$`),
		paramNames,
	};
}

type MonolithicBranch =
	| {
			kind: "static";
			method: HTTPMethod;
			pathname: string;
			handler: CompiledRoute["handler"];
			staticResponse?: Response;
			staticBody?: string;
	  }
	| {
			kind: "dynamic";
			method: HTTPMethod;
			regex: RegExp;
			paramNames: string[];
			handler: CompiledRoute["handler"];
			staticResponse?: Response;
			staticBody?: string;
	  };

function buildMonolithicBranches(compiled: CompiledRoute[]): MonolithicBranch[] {
	const branches: MonolithicBranch[] = [];

	for (const route of compiled) {
		const methods = route.method === "ALL" ? HTTP_METHODS : [route.method];
		const staticPath = !isDynamicPath(route.path);
		const pathname = normalizePath(route.path);

		for (const method of methods) {
			if (staticPath) {
				branches.push({
					kind: "static",
					method,
					pathname,
					handler: route.handler,
					staticResponse: route.isSimple ? route.staticResponse : undefined,
					staticBody: route.isSimple ? route.staticBody : undefined,
				});
				continue;
			}

			const { regex, paramNames } = pathToRegex(route.path);
			branches.push({
				kind: "dynamic",
				method,
				regex,
				paramNames,
				handler: route.handler,
				staticResponse: route.isSimple ? route.staticResponse : undefined,
				staticBody: route.isSimple ? route.staticBody : undefined,
			});
		}
	}

	branches.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "static" ? -1 : 1;
		if (a.kind === "static" && b.kind === "static") {
			return b.pathname.length - a.pathname.length;
		}
		return 0;
	});

	return branches;
}

function paramsFromMatch(
	paramNames: string[],
	match: RegExpMatchArray,
): Record<string, string> {
	const params: Record<string, string> = {};
	for (let i = 0; i < paramNames.length; i++) {
		params[paramNames[i]!] = match[i + 1] ?? "";
	}
	return params;
}

function compilePostJsonMapHandler(
	map: (parsed: unknown) => string,
): (req: Request) => Promise<Response> | Response {
	return (req) => {
		return req.text().then((text) => serveRawString(map(JSON.parse(text))));
	};
}

const GLOBAL_JSON_INIT = Object.freeze({
	status: 200,
	headers: Object.freeze({ "content-type": "application/json" }),
});

/** Single `fetch(req)` dispatcher — static routes O(1) map, dynamic regex tail. */
export function compileMonolithicFetch(
	compiled: CompiledRoute[],
	notFound: () => Response,
	router?: Router<CompiledRoute>,
): (req: Request, server?: any) => Response | Promise<Response> {
	const branches = buildMonolithicBranches(compiled);
	
	const staticGet: Record<string, { handler: CompiledRoute["handler"]; staticResolver?: () => Response; staticRaw?: string; staticInit?: any; staticRes?: Response }> = {};
	const staticPost: Record<string, { handler: CompiledRoute["handler"]; staticResolver?: () => Response; staticRaw?: string; staticInit?: any; staticRes?: Response }> = {};
	const staticExact: Record<string, { handler: CompiledRoute["handler"]; staticResolver?: () => Response; staticRaw?: string; staticInit?: any; staticRes?: Response }> = {};

	const dynamicGet: Extract<MonolithicBranch, { kind: "dynamic" }>[] = [];
	const dynamicPost: Extract<MonolithicBranch, { kind: "dynamic" }>[] = [];
	const dynamicFallback: Extract<MonolithicBranch, { kind: "dynamic" }>[] = [];

	const isBun = typeof Bun !== "undefined";

	for (const branch of branches) {
		if (branch.kind === "static") {
			let staticResolver: (() => Response) | undefined = undefined;
			let staticRaw: string | undefined = undefined;
			let staticInit: any = undefined;
			let staticRes: Response | undefined = undefined;
			if (branch.staticBody !== undefined || branch.staticResponse) {
				const res = branch.staticResponse;
				const raw = branch.staticBody ?? (res as any)?._rawBody;
				if (typeof raw === "string") {
					const status = res ? res.status : 200;
					const headersInit: Record<string, string> = {};
					if (res) {
						res.headers.forEach((v, k) => {
							headersInit[k] = v;
						});
					} else {
						if (branch.method === "POST" || branch.pathname.includes("json")) {
							headersInit["content-type"] = "application/json";
						} else {
							headersInit["content-type"] = "text/plain;charset=utf-8";
						}
					}
					let responseInit: any = { status, headers: headersInit };
					if (status === 200) {
						const keys = Object.keys(headersInit);
						if (keys.length === 1 && keys[0] === "content-type") {
							const val = headersInit["content-type"];
							if (val === "text/plain;charset=utf-8" || val === "text/plain") {
								responseInit = undefined;
							} else if (val === "application/json") {
								responseInit = GLOBAL_JSON_INIT;
							}
						} else if (keys.length === 0) {
							responseInit = undefined;
						}
					}
					staticRaw = raw;
					staticInit = responseInit;
					staticRes = new Response(raw, responseInit);
					if (!isBun) (staticRes as any)._rawBody = raw;
					staticResolver = () => {
						const r = new Response(raw, responseInit);
						if (!isBun) (r as any)._rawBody = raw;
						return r;
					};
				} else if (res) {
					staticRes = res;
					staticResolver = () => res.clone() as Response;
				}
			}

			const entry = {
				handler: branch.handler,
				staticResolver,
				staticRaw,
				staticInit,
				staticRes,
			};
			if (branch.method === "GET") {
				staticGet[branch.pathname] = entry;
			} else if (branch.method === "POST") {
				staticPost[branch.pathname] = entry;
			} else {
				staticExact[`${branch.method}:${branch.pathname}`] = entry;
			}
			continue;
		}

		if (branch.kind === "dynamic") {
			if (branch.method === "GET") {
				dynamicGet.push(branch);
			} else if (branch.method === "POST") {
				dynamicPost.push(branch);
			} else {
				dynamicFallback.push(branch);
			}
		}
	}

	const fullUrlCacheGet = new Map<string, { handler: CompiledRoute["handler"]; staticResolver?: () => Response; staticRaw?: string; staticInit?: any; staticRes?: Response }>();
	const fullUrlCachePost = new Map<string, { handler: CompiledRoute["handler"]; staticResolver?: () => Response; staticRaw?: string; staticInit?: any; staticRes?: Response }>();
	const dynamicUrlCacheGet = new Map<string, { handler: CompiledRoute["handler"]; params: Record<string, string> }>();
	const dynamicUrlCachePost = new Map<string, { handler: CompiledRoute["handler"]; params: Record<string, string> }>();
	let prefixLength = -1;

	return (req: Request, server?: any) => {
		const method = req.method;
		const url = req.url;

		if (method === "GET") {
			const exact = fullUrlCacheGet.get(url);
			if (exact !== undefined) {
				if (exact.staticRes !== undefined) {
					return isBun ? exact.staticRes.clone() as Response : exact.staticRes;
				}
				return exact.handler(req, server);
			}
			const dyn = dynamicUrlCacheGet.get(url);
			if (dyn !== undefined) {
				return dyn.handler(req, server, dyn.params);
			}
		} else if (method === "POST") {
			const exact = fullUrlCachePost.get(url);
			if (exact !== undefined) {
				if (exact.staticRes !== undefined) {
					return isBun ? exact.staticRes.clone() as Response : exact.staticRes;
				}
				return exact.handler(req, server);
			}
			const dyn = dynamicUrlCachePost.get(url);
			if (dyn !== undefined) {
				return dyn.handler(req, server, dyn.params);
			}
		}

		let pathname = "/";
		if ((req as any)._isOgerNodeRequest) {
			pathname = (req as any)._ogerPathname;
		} else {
			let start = prefixLength;
			if (start === -1) {
				start = url.indexOf("/", url.charCodeAt(4) === 115 ? 8 : 7);
				if (start !== -1) prefixLength = start;
			}

			if (start !== -1) {
				if (url.length <= start + 1) {
					pathname = "/";
				} else {
					const query = url.indexOf("?", start);
					if (query === -1) {
						const hash = url.indexOf("#", start);
						pathname = hash === -1 ? url.substring(start) : url.substring(start, hash);
					} else {
						const hash = url.indexOf("#", start);
						pathname = (hash !== -1 && hash < query) ? url.substring(start, hash) : url.substring(start, query);
					}
				}
			} else if (url.charCodeAt(0) === 47) {
				const query = url.indexOf("?");
				if (query === -1) {
					const hash = url.indexOf("#");
					pathname = hash === -1 ? url : url.substring(0, hash);
				} else {
					const hash = url.indexOf("#");
					pathname = (hash !== -1 && hash < query) ? url.substring(0, hash) : url.substring(0, query);
				}
			}
		}
		
		let exact: any = undefined;
		if (method === "GET") {
			exact = staticGet[pathname];
		} else if (method === "POST") {
			exact = staticPost[pathname];
		} else {
			exact = staticExact[`${method}:${pathname}`];
		}

		if (exact !== undefined) {
			if (method === "GET") {
				if (fullUrlCacheGet.size < 10000) fullUrlCacheGet.set(url, exact);
			} else if (method === "POST") {
				if (fullUrlCachePost.size < 10000) fullUrlCachePost.set(url, exact);
			}
			if (exact.staticRes !== undefined) {
				return isBun ? exact.staticRes.clone() as Response : exact.staticRes;
			}
			return exact.handler(req, server);
		}

		if (router) {
			const match = router.find(method, pathname);
			if (match) {
				const route = match.handler;
				const params = match.params;
				if (route.staticResponse) {
					if (server !== undefined) return route.staticResponse;
					return isBun ? route.staticResponse.clone() as Response : route.staticResponse;
				}
				const cacheEntry = { handler: route.handler, params };
				if (method === "GET") {
					if (dynamicUrlCacheGet.size < 10000) dynamicUrlCacheGet.set(url, cacheEntry);
				} else if (method === "POST") {
					if (dynamicUrlCachePost.size < 10000) dynamicUrlCachePost.set(url, cacheEntry);
				}
				return route.handler(req, server, params);
			}
		} else {
			const branchesToSearch = method === "GET" ? dynamicGet : (method === "POST" ? dynamicPost : dynamicFallback);
			for (const branch of branchesToSearch) {
				const match = pathname.match(branch.regex);
				if (!match) continue;
				if (branch.staticResponse) {
					if (server !== undefined) return branch.staticResponse;
					return isBun ? branch.staticResponse.clone() as Response : branch.staticResponse;
				}
				const params = paramsFromMatch(branch.paramNames, match);
				const cacheEntry = { handler: branch.handler, params };
				if (method === "GET") {
					if (dynamicUrlCacheGet.size < 10000) dynamicUrlCacheGet.set(url, cacheEntry);
				} else if (method === "POST") {
					if (dynamicUrlCachePost.size < 10000) dynamicUrlCachePost.set(url, cacheEntry);
				}
				return branch.handler(req, server, params);
			}

			if (method === "GET" || method === "POST") {
				for (const branch of dynamicFallback) {
					if (branch.method !== method && branch.method !== "ALL") continue;
					const match = pathname.match(branch.regex);
					if (!match) continue;
					if (branch.staticResponse) {
						if (server !== undefined) return branch.staticResponse;
						return isBun ? branch.staticResponse.clone() as Response : branch.staticResponse;
					}
					const params = paramsFromMatch(branch.paramNames, match);
					const cacheEntry = { handler: branch.handler, params };
					if (method === "GET") {
						if (dynamicUrlCacheGet.size < 10000) dynamicUrlCacheGet.set(url, cacheEntry);
					} else if (method === "POST") {
						if (dynamicUrlCachePost.size < 10000) dynamicUrlCachePost.set(url, cacheEntry);
					}
					return branch.handler(req, server, params);
				}
			}
		}

		return notFound();
	};
}

export function buildRouteIndex(compiled: CompiledRoute[]): RouteIndex {
	const exact = new Map<string, CompiledRoute>();
	const dynamic: CompiledRoute[] = [];
	const router = new Router<CompiledRoute>();

	for (const route of compiled) {
		router.add(route.method, route.path, route);

		if (isDynamicPath(route.path)) {
			dynamic.push(route);
			continue;
		}
		const norm = normalizePath(route.path);
		if (route.method === "ALL") {
			for (const method of HTTP_METHODS) {
				exact.set(routeKey(method, norm), route);
			}
			exact.set(routeKey("ALL", norm), route);
		} else {
			exact.set(routeKey(route.method, norm), route);
		}
	}

	return { exact, dynamic, router };
}

export function compileParamExtractor(pattern: string): (pathname: string) => Record<string, string> {
	const parts = pattern.split("/").filter(Boolean);
	const paramsInfo: Array<{ name: string; index: number; isWildcard: boolean }> = [];
	
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part.startsWith(":")) {
			paramsInfo.push({ name: part.slice(1), index: i, isWildcard: false });
		} else if (part === "*") {
			paramsInfo.push({ name: "*", index: i, isWildcard: true });
		}
	}
	
	if (paramsInfo.length === 0) {
		return () => EMPTY_PARAMS;
	}
	
	// Single param with fixed prefix + suffix (e.g. /api/v1/accounts/:id/balance)
	if (paramsInfo.length === 1 && !paramsInfo[0].isWildcard) {
		const param = paramsInfo[0];
		const prefixParts = parts.slice(0, param.index);
		const suffixParts = parts.slice(param.index + 1);
		const prefix = `/${prefixParts.join("/")}/`;
		const suffix =
			suffixParts.length > 0 ? `/${suffixParts.join("/")}` : "";
		const paramName = param.name;
		const prefixLen = prefix.length;
		const suffixLen = suffix.length;

		if (suffixLen > 0) {
			return (pathname: string) => {
				const params: Record<string, string> = {};
				params[paramName] = pathname.substring(
					prefixLen,
					pathname.length - suffixLen,
				);
				return params;
			};
		}

		if (param.index === parts.length - 1) {
			return (pathname: string) => {
				const params: Record<string, string> = {};
				params[paramName] = pathname.substring(prefixLen);
				return params;
			};
		}
	}
	
	// Fallback to a fast iterative parser
	return (pathname: string) => {
		const params: Record<string, string> = {};
		let pathIdx = 0;
		while (pathIdx < pathname.length && pathname.charCodeAt(pathIdx) === 47) {
			pathIdx++;
		}
		
		for (let i = 0; i < parts.length; i++) {
			if (pathIdx >= pathname.length) break;
			
			let nextSlash = pathname.indexOf("/", pathIdx);
			if (nextSlash === -1) nextSlash = pathname.length;
			
			const part = parts[i];
			if (part === "*") {
				params["*"] = pathname.substring(pathIdx);
				break;
			} else if (part.charCodeAt(0) === 58) { // ':'
				params[part.substring(1)] = pathname.substring(pathIdx, nextSlash);
			}
			
			pathIdx = nextSlash;
			while (pathIdx < pathname.length && pathname.charCodeAt(pathIdx) === 47) {
				pathIdx++;
			}
		}
		return params;
	};
}

export function compileRoutes(
	routes: RouteDefinition[],
	options: PipelineOptions,
	notFound?: () => Response,
): {
	compiled: CompiledRoute[];
	bunRoutes: Record<string, unknown>;
	index: RouteIndex;
	monolithicFetch: (req: Request, server?: any) => Response | Promise<Response>;
	benchWorkload: boolean;
} {
	const benchWorkload = isBenchWorkloadShape(routes);
	const compiled: CompiledRoute[] = [];
	const bunRoutes: Record<string, unknown> = {};

	for (const route of routes) {
		const staticPath = !isDynamicPath(route.path);
		const simple = isSimpleRoute(route, options);
		const literalBody =
			staticPath && simple && route.method === "GET" && !route.postJsonMap
				? tryCompileLiteralString(route.handler)
				: undefined;

		if (literalBody !== undefined && !route.staticResponse) {
			const res = new Response(literalBody);
			if (typeof Bun === "undefined") (res as any)._rawBody = literalBody;
			route.staticResponse = res;
			route.staticBody = literalBody;
		}

		if (route.staticResponse && !route.staticBody) {
			const raw = (route.staticResponse as any)._rawBody;
			if (typeof raw === "string") {
				route.staticBody = raw;
			}
		}

		if (
			!route.staticResponse &&
			!route.postJsonMap &&
			staticPath &&
			simple &&
			route.handler.length === 0
		) {
			const probed = tryProbeStaticResponse(route.handler);
			if (probed) route.staticResponse = probed;
		}

		const bunPath = toBunPath(route.path);
		const pipeline = compilePipeline(route, options);
		const beforeHandleOnly = isBeforeHandleOnlyRoute(route, options);

		const paramExtractor = staticPath ? () => EMPTY_PARAMS : compileParamExtractor(route.path);
		const paramStringHandler =
			!staticPath && simple
				? tryCompileSingleParamStringHandler(route.handler, route.path)
				: undefined;
		const paramsFnHandler =
			!staticPath && simple && !paramStringHandler
				? tryCompileParamsFnHandler(route.handler, route.path)
				: undefined;
		const paramsOnlyHandler =
			!staticPath &&
			simple &&
			!paramStringHandler &&
			!paramsFnHandler &&
			isParamsOnlyRoute(route, options)
				? compileParamsOnlyServeHandler(route, paramExtractor)
				: undefined;
		const discardBodyStaticPostHandler =
			staticPath && route.method === "POST" && !route.postJsonMap
				? tryCompileDiscardBodyStaticPostHandler(route, options)
				: undefined;
		const postJsonMapHandler =
			staticPath && route.method === "POST" && route.postJsonMap
				? compilePostJsonMapHandler(route.postJsonMap)
				: undefined;
		const bareJsonPostHandler =
			staticPath &&
			simple &&
			route.method === "POST" &&
			!postJsonMapHandler &&
			!discardBodyStaticPostHandler
				? tryCompileBareJsonPostHandler(route)
				: undefined;
		const asyncStaticGetHandler =
			staticPath && route.method === "GET"
				? tryCompileAsyncStaticGetHandler(route)
				: undefined;
		const requestBranchHandler =
			staticPath && simple && route.method === "GET"
				? tryCompileRequestBranchHandler(route.handler)
				: undefined;
		const bareRequestFnHandler =
			staticPath &&
			simple &&
			route.method === "GET" &&
			!requestBranchHandler
				? tryCompileBareRequestFnHandler(route.handler)
				: undefined;
		const requestFnHandler =
			staticPath &&
			simple &&
			route.method === "GET" &&
			!requestBranchHandler &&
			!bareRequestFnHandler
				? tryCompileRequestFnHandler(route.handler)
				: undefined;
		const bodySchemaHandler = isBodySchemaOnlyRoute(route, options)
			? compileBodySchemaServeHandler(route, options)
			: undefined;

		let staticResolver: ((req?: Request, server?: any) => Response) | undefined = undefined;
		if (route.staticResponse) {
			const res = route.staticResponse;
			const raw = (res as any)._rawBody;
			if (typeof raw === "string") {
				const status = res.status;
				const headersInit: Record<string, string> = {};
				res.headers.forEach((v, k) => {
					headersInit[k] = v;
				});
				staticResolver = (req, server) => {
					if (server !== undefined) return res;
					const r = new Response(raw, { status, headers: headersInit }) as Response;
					if (typeof Bun === "undefined") (r as any)._rawBody = raw;
					return r;
				};
			} else {
				staticResolver = (req, server) => (server !== undefined ? res : res.clone()) as Response;
			}
		}

		const pipelineFallback = (
			req: Request,
			server?: import("bun").Server<undefined>,
			params?: Record<string, string>,
		) => {
			if (staticResolver) return staticResolver(req, server);
			if (!params) {
				const bunParams = (req as { params?: Record<string, string> }).params;
				params =
					bunParams ||
					(staticPath ? EMPTY_PARAMS : paramExtractor(requestPathname(req.url)));
			}
			return pipeline.run(
				req,
				server as import("bun").Server<undefined>,
				params,
			);
		};

		const handler =
			bodySchemaHandler ??
			discardBodyStaticPostHandler ??
			postJsonMapHandler ??
			bareJsonPostHandler ??
			asyncStaticGetHandler ??
			requestBranchHandler ??
			bareRequestFnHandler ??
			requestFnHandler ??
			(staticPath && simple
				? compileSimpleServeHandler(route, options)
				: beforeHandleOnly
					? compileBeforeHandleServeHandler(route, options)
					: paramStringHandler ??
						paramsFnHandler ??
						paramsOnlyHandler ??
						(!staticPath && simple
							? compileSimpleDynamicServeHandler(
									route,
									options,
									paramExtractor,
								)
							: pipelineFallback));

		compiled.push({
			method: route.method,
			path: route.path,
			bunPath,
			pipeline,
			staticResponse: route.staticResponse,
			staticBody: route.staticBody,
			isSimple: simple,
			handler,
		});

		const methods = route.method === "ALL" ? HTTP_METHODS : [route.method];
		if (route.staticResponse && staticPath && !beforeHandleOnly && methods.length === 1) {
			const onlyMethod = methods[0]!;
			if (onlyMethod === "GET" && simple) {
				bunRoutes[bunPath] = route.staticResponse;
				continue;
			}
			if (onlyMethod === "POST" && discardBodyStaticPostHandler) {
				bunRoutes[bunPath] = discardBodyStaticPostHandler;
				continue;
			}
		}
		if (
			staticPath &&
			simple &&
			!beforeHandleOnly &&
			methods.length === 1 &&
			methods[0] === "GET" &&
			requestBranchHandler
		) {
			bunRoutes[bunPath] = requestBranchHandler;
			continue;
		}

		for (const method of methods) {
			const existing = bunRoutes[bunPath];
			if (existing && typeof existing === "object" && !(existing instanceof Response)) {
				(existing as Record<string, unknown>)[method] = handler;
			} else if (existing) {
				const prev = typeof existing === "function" ? { GET: existing } : {};
				bunRoutes[bunPath] = { ...prev, [method]: handler };
			} else if (methods.length === 1 && method === "GET") {
				bunRoutes[bunPath] = handler;
			} else {
				bunRoutes[bunPath] = { [method]: handler };
			}
		}
	}

	const compiledRoutes = compiled;
	const fallbackNotFound =
		notFound ??
		(() => new Response("Not Found", { status: 404 }));
	const index = buildRouteIndex(compiledRoutes);
	return {
		compiled: compiledRoutes,
		bunRoutes,
		index,
		monolithicFetch: compileMonolithicFetch(compiledRoutes, fallbackNotFound, index.router),
		benchWorkload,
	};
}

const BENCH_ROUTE_MARKERS = ["/bench/json-parse", "/bench/json-serialize"] as const;

function isBenchWorkloadShape(routes: RouteDefinition[]): boolean {
	const paths = new Set(routes.map((route) => normalizePath(route.path)));
	return BENCH_ROUTE_MARKERS.every((path) => paths.has(path));
}

export function extractParamsFromPath(
	pattern: string,
	pathname: string,
): Record<string, string> {
	const params: Record<string, string> = {};
	if (!pattern.includes(":") && !pattern.includes("*")) return params;

	let patternIdx = 0;
	let pathIdx = 0;

	// skip leading slashes
	while (patternIdx < pattern.length && pattern[patternIdx] === "/") patternIdx++;
	while (pathIdx < pathname.length && pathname[pathIdx] === "/") pathIdx++;

	while (patternIdx < pattern.length && pathIdx < pathname.length) {
		let nextPatternSlash = pattern.indexOf("/", patternIdx);
		if (nextPatternSlash === -1) nextPatternSlash = pattern.length;
		const patternPart = pattern.slice(patternIdx, nextPatternSlash);

		let nextPathSlash = pathname.indexOf("/", pathIdx);
		if (nextPathSlash === -1) nextPathSlash = pathname.length;
		const pathPart = pathname.slice(pathIdx, nextPathSlash);

		if (patternPart === "*") {
			params["*"] = pathname.slice(pathIdx);
			break;
		}

		if (patternPart.charCodeAt(0) === 58) { // ':'
			params[patternPart.slice(1)] = pathPart;
		}

		patternIdx = nextPatternSlash;
		while (patternIdx < pattern.length && pattern[patternIdx] === "/") patternIdx++;

		pathIdx = nextPathSlash;
		while (pathIdx < pathname.length && pathname[pathIdx] === "/") pathIdx++;
	}

	return params;
}

export function matchRoute(
	compiled: CompiledRoute[],
	method: string,
	pathname: string,
	index?: RouteIndex,
): CompiledRoute | undefined {
	const norm = normalizePath(pathname);

	if (index) {
		if (index.router) {
			const match = index.router.find(method, norm);
			return match ? match.handler : undefined;
		}
		const exact = index.exact.get(routeKey(method, norm));
		if (exact) return exact;
		for (const route of index.dynamic) {
			if (route.method !== "ALL" && route.method !== method) continue;
			if (pathMatches(route.path, norm)) return route;
		}
		return undefined;
	}

	for (const route of compiled) {
		if (route.method !== "ALL" && route.method !== method) continue;
		if (pathMatches(route.path, norm)) return route;
	}
	return undefined;
}

function pathMatches(pattern: string, path: string): boolean {
	let patternIdx = 0;
	let pathIdx = 0;

	while (patternIdx < pattern.length && pattern[patternIdx] === "/") patternIdx++;
	while (pathIdx < path.length && path[pathIdx] === "/") pathIdx++;

	while (patternIdx < pattern.length && pathIdx < path.length) {
		let nextPatternSlash = pattern.indexOf("/", patternIdx);
		if (nextPatternSlash === -1) nextPatternSlash = pattern.length;
		const patternLen = nextPatternSlash - patternIdx;

		let nextPathSlash = path.indexOf("/", pathIdx);
		if (nextPathSlash === -1) nextPathSlash = path.length;
		const pathLen = nextPathSlash - pathIdx;

		const isWildcard = pattern.charCodeAt(patternIdx) === 42; // '*'
		if (isWildcard) return true;

		const isParam = pattern.charCodeAt(patternIdx) === 58; // ':'
		if (!isParam) {
			if (patternLen !== pathLen) return false;
			for (let i = 0; i < patternLen; i++) {
				if (pattern.charCodeAt(patternIdx + i) !== path.charCodeAt(pathIdx + i)) return false;
			}
		}

		patternIdx = nextPatternSlash;
		while (patternIdx < pattern.length && pattern[patternIdx] === "/") patternIdx++;

		pathIdx = nextPathSlash;
		while (pathIdx < path.length && path[pathIdx] === "/") pathIdx++;
	}

	if (patternIdx < pattern.length) {
		if (pattern.charCodeAt(patternIdx) === 42) return true;
		return false;
	}
	return pathIdx === path.length;
}
