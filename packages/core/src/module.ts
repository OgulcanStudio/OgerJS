import type { Container, Token } from "./di";
import { createContainer } from "./di";
import { Oger } from "./oger";
import type { RouteHandler } from "./types";

export type Provider =
	| { token: Token; useValue: unknown }
	| { token: Token; useFactory: (container: Container) => unknown };

export interface ModuleContext {
	app: Oger;
	container: Container;
}

export interface OgerModule {
	name?: string;
	providers?: Provider[];
	/** Phase 2: nested modules merged in dependency order. */
	imports?: OgerModule[];
	/** Phase 2: tokens exported to parent module scope. */
	exports?: Token[];
	/** Optional route registration against a fresh scoped app instance. */
	setup?: (ctx: ModuleContext) => void;
}

/**
 * Optional module pattern: registers providers on a child container and merges routes via `.use()`.
 * Controllers are not required — use `setup` or plain route handlers.
 */
export function defineModule(module: OgerModule): Oger {
	const container = createContainer();
	for (const p of module.providers ?? []) {
		if ("useValue" in p) container.register(p.token, p.useValue);
		else container.registerFactory(p.token, p.useFactory);
	}

	const child = new Oger({
		name: module.name,
		scope: "scoped",
		seed: Math.random().toString(36).substring(2, 9),
	});
	child.decorate({ container });
	child.state({ [`di:${module.name ?? "anonymous"}`]: container });
	module.setup?.({ app: child, container });
	return child;
}

export interface ControllerRoute {
	method: "get" | "post" | "put" | "patch" | "delete" | "options" | "head";
	path: string;
	handler: RouteHandler;
	body?: import("./schema/types").TSchema;
	query?: import("./schema/types").TSchema;
	params?: import("./schema/types").TSchema;
	headers?: import("./schema/types").TSchema;
	cookie?: import("./schema/types").TSchema;
	response?: import("./schema/types").TSchema;
	schema?: any;
	beforeHandle?: any;
	[key: string]: unknown;
}

export interface ControllerDefinition {
	prefix?: string;
	routes: ControllerRoute[];
}

/** Opt-in controller helper — maps route tables onto a group prefix. */
export function defineController(def: ControllerDefinition): Oger {
	const child = new Oger({
		name: "controller",
		scope: "scoped",
		seed: Math.random().toString(36).substring(2, 9),
	});
	const register = (instance: Oger) => {
		for (const route of def.routes) {
			const { method, path, handler, ...opts } = route;
			(instance as any)[method](path, handler, opts);
		}
	};
	if (def.prefix) child.group(def.prefix, register);
	else register(child);
	return child;
}
