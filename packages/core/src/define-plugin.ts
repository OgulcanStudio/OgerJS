import { Oger } from "./oger";
import type { HookScope } from "./types";

/** npm package id for an official plugin (e.g. `@ogerjs/cors`). */
export type OfficialPluginName = `@ogerjs/${string}`;

/** Phase 2: plugin load order, conflicts, and version constraints. */
export interface PluginDependencyGraph {
	requires?: OfficialPluginName[];
	conflicts?: OfficialPluginName[];
	optional?: OfficialPluginName[];
	/** Semver range against `@ogerjs/core` or peer plugins (enforced in Phase 2). */
	version?: string;
}

export interface OfficialPluginMeta {
	readonly name: OfficialPluginName;
	readonly scope?: HookScope;
	readonly dependencies?: PluginDependencyGraph;
}

export type OgerPlugin = Oger;

/** `() => Oger` instance passed to `app.use(plugin())`. */
export type OgerPluginFactory<Options = void> = Options extends void
	? () => OgerPlugin
	: (options: Options) => OgerPlugin;

/** `(parent) => Oger` for plugins that read parent routes/state at apply time. */
export type OgerScopedPluginFactory<Options = void> = Options extends void
	? (parent: Oger) => OgerPlugin
	: (options: Options) => (parent: Oger) => OgerPlugin;

function createInstance(
	meta: OfficialPluginMeta,
	seed?: string | number,
): Oger {
	return new Oger({ name: meta.name, scope: meta.scope, seed });
}

/**
 * Standard factory for official plugins: `export const foo = definePlugin(meta, setup)`.
 * Usage: `app.use(foo())`.
 */
export function definePlugin(
	meta: OfficialPluginMeta,
	setup: (app: Oger) => Oger | undefined,
): () => OgerPlugin {
	return () => {
		const app = createInstance(meta);
		const result = setup(app);
		return result ?? app;
	};
}

/**
 * Plugin factory with required options and optional dedupe seed.
 * Usage: `app.use(jwt({ secret: "x" }))`.
 */
export function definePluginWithOptions<Options>(
	meta: OfficialPluginMeta,
	setup: (app: Oger, options: Options) => Oger | undefined,
	getSeed?: (options: Options) => string | number | undefined,
): (options: Options) => OgerPlugin {
	return (options: Options) => {
		const app = createInstance(meta, getSeed?.(options));
		const result = setup(app, options);
		return result ?? app;
	};
}

/**
 * Plugin factory with optional options (defaults applied when omitted).
 * Usage: `app.use(cors())` or `app.use(cors({ origin: "https://a.com" }))`.
 */
export function definePluginWithOptionalOptions<Options>(
	meta: OfficialPluginMeta,
	setup: (app: Oger, options: Options) => Oger | undefined,
	defaults: Options,
	getSeed?: (options: Options) => string | number | undefined,
): (options?: Options) => OgerPlugin {
	return (options?: Options) => {
		const resolved = { ...defaults, ...options } as Options;
		const app = createInstance(meta, getSeed?.(resolved));
		const result = setup(app, resolved);
		return result ?? app;
	};
}

/**
 * Parent-scoped plugin: `app.use(openapi(opts)(app))` or `app.use(fn => openapi(opts)(fn))` pattern.
 */
export function defineScopedPlugin<Options>(
	_meta: OfficialPluginMeta,
	setup: (parent: Oger, options: Options) => Oger,
): (options: Options) => (parent: Oger) => OgerPlugin {
	return (options: Options) => (parent: Oger) => setup(parent, options);
}

/**
 * Parent-scoped plugin with optional options.
 */
export function defineScopedPluginWithOptionalOptions<Options>(
	_meta: OfficialPluginMeta,
	setup: (parent: Oger, options: Options) => Oger,
	defaults: Options,
): (options?: Options) => (parent: Oger) => OgerPlugin {
	return (options?: Options) => {
		const resolved = { ...defaults, ...options } as Options;
		return (parent: Oger) => setup(parent, resolved);
	};
}
