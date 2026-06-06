import type {
	HTTPMethod,
	RouteDefinition,
	RouteErrors,
	RouteMeta,
	RouteSchema,
} from "../types";

export interface RegisteredRoute {
	method: HTTPMethod;
	path: string;
	meta?: RouteMeta;
	schema?: RouteSchema;
	errors?: RouteErrors;
	macroFlags?: Record<string, boolean | unknown>;
}

export class RouteRegistry {
	private readonly _entries: RegisteredRoute[];

	constructor(entries: RegisteredRoute[] = []) {
		this._entries = entries;
	}

	get entries(): readonly RegisteredRoute[] {
		return this._entries;
	}

	find(method: HTTPMethod | string, path: string): RegisteredRoute | undefined {
		const norm = path.startsWith("/") ? path : `/${path}`;
		return this._entries.find((e) => e.method === method && e.path === norm);
	}

	/** Serializable snapshot for OpenAPI, SDK generators, and test fixtures. */
	toJSON(): RegisteredRoute[] {
		return this._entries.map((e) => ({ ...e }));
	}
}

export function buildRouteRegistry(routes: RouteDefinition[]): RouteRegistry {
	const entries: RegisteredRoute[] = routes.map((r) => ({
		method: r.method,
		path: r.path,
		meta: r.meta,
		schema: r.schema,
		errors: r.errors,
		macroFlags: r.macroFlags,
	}));
	return new RouteRegistry(entries);
}
