import type { TSchema } from "./schema/types";
import type { HookHandler, RouteDefinition } from "./types";

export interface MacroDefinition {
	resolve?: HookHandler;
	beforeHandle?: HookHandler | HookHandler[];
	cookie?: TSchema;
	headers?: TSchema;
	body?: TSchema;
	query?: TSchema;
	params?: TSchema;
}

export type MacroMap = Record<string, MacroDefinition>;

export function applyMacros(
	route: RouteDefinition,
	macros: MacroMap,
	flags?: Record<string, boolean | unknown>,
): void {
	if (!flags) return;
	for (const [name, enabled] of Object.entries(flags)) {
		if (!enabled) continue;
		const macro = macros[name];
		if (!macro) continue;

		if (macro.cookie) route.schema = { ...route.schema, cookie: macro.cookie };
		if (macro.headers)
			route.schema = { ...route.schema, headers: macro.headers };
		if (macro.body) route.schema = { ...route.schema, body: macro.body };
		if (macro.query) route.schema = { ...route.schema, query: macro.query };
		if (macro.params) route.schema = { ...route.schema, params: macro.params };

		if (macro.beforeHandle) {
			const handlers = Array.isArray(macro.beforeHandle)
				? macro.beforeHandle
				: [macro.beforeHandle];
			route.hooks.beforeHandle = [
				...(route.hooks.beforeHandle ?? []),
				...handlers,
			];
		}
		if (macro.resolve) {
			route.hooks.beforeHandle = [
				...(route.hooks.beforeHandle ?? []),
				macro.resolve,
			];
		}
	}
	route.macroFlags = { ...route.macroFlags, ...flags };
}
