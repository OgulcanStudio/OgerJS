/** Whether to delegate to Bun-native APIs (respects FORCE_NODE_COMPAT test hook). */
export function useBunNative(): boolean {
	return typeof process !== "undefined" &&
		process.versions !== undefined &&
		process.versions.bun !== undefined &&
		!(globalThis as any).FORCE_NODE_COMPAT;
}
