import type { Oger } from "./oger";
import type {
	HookScope,
	LifecycleHook,
	PluginMeta,
	RouteDefinition,
} from "./types";

export interface PluginInstance {
	instance: Oger;
	meta: PluginMeta;
}

const usedPlugins = new WeakMap<Oger, Set<string>>();

export function pluginKey(meta: PluginMeta): string {
	return `${meta.name ?? "anonymous"}:${meta.seed ?? ""}`;
}

export function shouldApplyPlugin(
	parent: Oger,
	_child: Oger,
	meta: PluginMeta,
): boolean {
	const key = pluginKey(meta);
	let set = usedPlugins.get(parent);
	if (!set) {
		set = new Set();
		usedPlugins.set(parent, set);
	}
	if (set.has(key)) return false;
	set.add(key);
	return true;
}

export function mergeRoutes(
	target: RouteDefinition[],
	source: RouteDefinition[],
	prefix = "",
): void {
	for (const route of source) {
		const path = prefix + route.path;
		target.push({ ...route, path: path || "/" });
	}
}

export function mergeHooks(
	target: Partial<Record<LifecycleHook, import("./types").HookHandler[]>>,
	source: Partial<Record<LifecycleHook, import("./types").HookHandler[]>>,
	scope: HookScope,
	childScope: HookScope,
): void {
	if (scope === "local" && childScope === "global") return;
	for (const [hook, handlers] of Object.entries(source)) {
		const h = hook as LifecycleHook;
		if (!handlers?.length) continue;
		if (!target[h]) target[h] = [];
		target[h]?.push(...handlers);
	}
}

export function mergeStore(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): void {
	Object.assign(target, source);
}
