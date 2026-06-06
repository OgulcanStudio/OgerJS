/** Whether to delegate to Bun-native APIs (respects FORCE_NODE_COMPAT test hook). */
export function useBunNative(): boolean {
	return typeof Bun !== "undefined" && !(globalThis as any).FORCE_NODE_COMPAT;
}
