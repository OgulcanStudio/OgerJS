/** Runtime profile for OgerJS apps (edge subset vs Bun-enhanced). */
export type RuntimeMode = "default" | "edge" | "bun-enhanced";

const BUN_ONLY_FEATURES = new Set([
	"bun.serve",
	"bun.password",
	"bun.gzip",
	"bun.sqlite",
	"bun.redis",
	"bun.cryptohasher",
	"hot-reload",
	"native-compress",
]);

let runtimeMode: RuntimeMode = "default";
const warnedFeatures = new Set<string>();

export function setRuntimeMode(mode: RuntimeMode): void {
	runtimeMode = mode;
}

export function getRuntimeMode(): RuntimeMode {
	return runtimeMode;
}

export function isBunRuntime(): boolean {
	return typeof process !== "undefined" &&
		process.versions !== undefined &&
		process.versions.bun !== undefined;
}

export function isEdgeMode(): boolean {
	return runtimeMode === "edge";
}

export function isBunEnhancedMode(): boolean {
	return runtimeMode === "bun-enhanced";
}

/** Features that require Bun and are unavailable in `edge` mode. */
export function isBunOnlyFeature(feature: string): boolean {
	return BUN_ONLY_FEATURES.has(feature);
}

/**
 * Log a one-time warning when using a Bun-only capability while `edge` mode is active.
 * No-op in `bun-enhanced` / `default` on Bun; always warns on non-Bun when feature is Bun-only.
 */
export function warnIfBunOnly(feature: string, detail?: string): void {
	if (warnedFeatures.has(feature)) return;
	const needsBun = isBunOnlyFeature(feature);
	if (!needsBun) return;

	const inEdge = runtimeMode === "edge";
	const onBun = isBunRuntime();
	if (inEdge || !onBun) {
		warnedFeatures.add(feature);
		const msg = detail
			? `[ogerjs] "${feature}" is Bun-only (${detail}). Edge/cross-runtime builds should avoid it.`
			: `[ogerjs] "${feature}" is Bun-only. Use default/bun-enhanced mode on Bun, or avoid this API on other runtimes.`;
		console.warn(msg);
	}
}

/** Whether the current mode allows a Bun-only feature without warning. */
export function allowsBunOnlyFeature(feature: string): boolean {
	if (!isBunOnlyFeature(feature)) return true;
	if (runtimeMode === "edge") return false;
	return isBunRuntime();
}
