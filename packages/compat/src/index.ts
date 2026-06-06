import {
	definePluginWithOptionalOptions,
	setRuntimeMode,
	warnIfBunOnly,
} from "@ogerjs/core";

export type { RuntimeMode } from "@ogerjs/core";
export {
	allowsBunOnlyFeature,
	getRuntimeMode,
	isBunEnhancedMode,
	isBunOnlyFeature,
	isBunRuntime,
	isEdgeMode,
	setRuntimeMode,
	warnIfBunOnly,
} from "@ogerjs/core";

export interface CompatOptions {
	/** Active profile (re-exported from core). */
	mode?: "default" | "edge" | "bun-enhanced";
	/** Bun-only features to validate at plugin load. */
	features?: string[];
}

/** Apply runtime mode and emit compatibility warnings for configured Bun-only features. */
export const compat = definePluginWithOptionalOptions<CompatOptions>(
	{ name: "@ogerjs/compat", scope: "global" },
	(_app, options) => {
		if (options.mode) setRuntimeMode(options.mode);
		for (const f of options.features ?? []) {
			warnIfBunOnly(f);
		}
		return _app;
	},
	{},
);

export { compress } from "./compress";
export { hash, hmac, randomBytes, randomUUID, timingSafeEqual } from "./crypto";
export { CryptoHasher } from "./hasher";
export { CompatFile, openFile } from "./file";
export type { FileStat } from "./file";
export { password } from "./password";
export { Database, Statement } from "./sqlite";
export type { DatabaseOptions } from "./sqlite";
export type { PasswordHashOptions } from "./password";

