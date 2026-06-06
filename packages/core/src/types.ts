import type { Server, ServerWebSocket } from "bun";
import type { ApiContractMode } from "./contract";
import type { TSchema } from "./schema/types";

export type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "OPTIONS"
	| "HEAD"
	| "ALL";

export type HookScope = "local" | "scoped" | "global";

export type LifecycleHook =
	| "onStart"
	| "onStop"
	| "onRequest"
	| "parse"
	| "transform"
	| "beforeHandle"
	| "afterHandle"
	| "mapResponse"
	| "onError"
	| "onAfterResponse";

/** HTTP statuses commonly declared on route error contracts. */
export type RouteErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

/** Declared error shape for a route (OpenAPI + client codegen). */
export interface RouteErrorDefinition {
	status: RouteErrorStatus;
	code?: string;
	title?: string;
	type?: string;
	description?: string;
}

export type RouteErrors = Partial<
	Record<RouteErrorStatus, RouteErrorDefinition>
>;

/** OpenAPI-oriented and app-level route metadata (tags, auth, rate limits, etc.). */
export interface RouteMeta {
	tags?: string[];
	summary?: string;
	description?: string;
	deprecated?: boolean;
	/** OpenAPI security requirement objects. */
	security?: Array<Record<string, string[]>>;
	/** App-level permission names for policy middleware. */
	permissions?: string[];
	/** Role names required for the route (policy middleware). */
	roles?: string[];
	/** When true or a scheme name, documents auth requirement. */
	auth?: boolean | string;
	rateLimit?: { max: number; windowMs?: number; key?: string };
	audit?: boolean | { action?: string };
	cache?: { maxAge?: number; private?: boolean; vary?: string[] };
	[key: string]: unknown;
}

export type HookHandler = (ctx: Context) => unknown | Promise<unknown>;

export interface RouteSchema {
	body?: TSchema;
	query?: TSchema;
	params?: TSchema;
	headers?: TSchema;
	cookie?: TSchema;
	response?: TSchema;
}

export interface RouteDefinition {
	method: HTTPMethod;
	path: string;
	handler: RouteHandler;
	hooks: Partial<Record<LifecycleHook, HookHandler[]>>;
	schema?: RouteSchema;
	meta?: RouteMeta;
	/** Declared problem responses for this route (400, 401, 422, …). */
	errors?: RouteErrors;
	macroFlags?: Record<string, boolean | unknown>;
	staticResponse?: Response;
	staticBody?: string;
	/** POST: `JSON.parse` body then map to response string (zero wrapper hot path). */
	postJsonMap?: (parsed: unknown) => string;
}

export type RouteHandler = (ctx: Context) => unknown | Promise<unknown>;

export interface SetHeaders {
	status?: number;
	headers?: Record<string, string>;
	redirect?: string;
	cookie?: Record<
		string,
		{
			value: string;
			httpOnly?: boolean;
			maxAge?: number;
			path?: string;
			secure?: boolean;
			sameSite?: "strict" | "lax" | "none";
		}
	>;
}

export interface Context {
	request: Request;
	params: Record<string, string>;
	query: Record<string, string>;
	headers: Record<string, string>;
	cookie: Record<string, { value: string }>;
	body: unknown;
	set: SetHeaders;
	store: Record<string, unknown>;
	route: string;
	server: Server<undefined> | null;
	/** Set during `mapResponse` / `finalize` to the handler return value. */
	pendingResult?: unknown;
	[key: string]: unknown;
}

export interface PluginMeta {
	name?: string;
	seed?: string | number;
	scope?: HookScope;
}

export type ListenDispatch = "routes" | "fetch";

export interface ListenOptions {
	port?: number;
	hostname?: string;
	/** Bun.serve dispatch: `routes` table (default) or monolithic `fetch` if-chain. */
	dispatch?: ListenDispatch;
	fetch?: (
		req: Request,
		server: Server<undefined>,
	) => Response | Promise<Response>;
	tls?: unknown;
	bodyLimit?: number;
	gracefulShutdown?: boolean;
	development?: boolean;
	websocket?: any;
}

export interface OgerConfig {
	prefix?: string;
	name?: string;
	seed?: string | number;
	scope?: HookScope;
	bodyLimit?: number;
	/** API contract mode — default `handler-first`. */
	contractMode?: ApiContractMode;
}

export interface CompiledRoute {
	method: HTTPMethod;
	path: string;
	bunPath: string;
	pipeline: CompiledPipeline;
	staticResponse?: Response;
	staticBody?: string;
	isSimple?: boolean;
	handler: (
		req: Request,
		server?: Server<undefined>,
		params?: Record<string, string>,
	) => Response | Promise<Response>;
}


export interface CompiledPipeline {
	run: (
		req: Request,
		server: Server<undefined>,
		params?: Record<string, string>,
	) => Response | Promise<Response>;
}

export type { Server, ServerWebSocket };
