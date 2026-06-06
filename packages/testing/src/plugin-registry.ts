/** Overrides for plugins whose export name differs from the default camelCase package id. */
export const PLUGIN_EXPORT_OVERRIDES: Record<string, string> = {
	static: "staticPlugin",
};

/** Default options for factories that require non-empty options (merged with package.json `ogerjs.testInvoke`). */
export const PLUGIN_TEST_INVOKE: Record<string, unknown> = {
	"@ogerjs/api-key": { validate: ["test-key"] },
	"@ogerjs/audit-log": { sink: () => {} },
	"@ogerjs/basic-auth": { username: "user", password: "pass" },
	"@ogerjs/body-limit": { maxSize: 1024 },
	"@ogerjs/idempotency": {},
	"@ogerjs/jwt": { secret: "test-secret-minimum-16-chars" },
	"@ogerjs/rate-limit": { max: 10, windowMs: 60_000 },
	"@ogerjs/request-id": {},
};

/** Plugins that use parent-scoped factories (`defineScopedPlugin*`). */
export const PLUGIN_SCOPED = new Set<string>([]);

/** Packages under `packages/*` that are not `Oger.use()` plugins. */
export const NON_PLUGIN_PACKAGES = new Set([
	"core",
	"create-oger",
	"events",
	"html",
	"stream",
	"testing",
	"upload",
	"ws",
]);

export interface OgerjsPluginManifest {
	plugin?: boolean;
	export?: string;
	scoped?: boolean;
	scope?: "local" | "scoped" | "global";
	testInvoke?: unknown;
}

export interface DiscoveredPlugin {
	dirName: string;
	packageName: string;
	manifest: OgerjsPluginManifest;
	exportName: string;
	testInvoke?: unknown;
}

export function defaultExportName(dirName: string): string {
	return (
		PLUGIN_EXPORT_OVERRIDES[dirName] ??
		dirName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
	);
}

export function resolveTestInvoke(
	packageName: string,
	manifest: OgerjsPluginManifest,
): unknown | undefined {
	if (manifest.testInvoke !== undefined) return manifest.testInvoke;
	return PLUGIN_TEST_INVOKE[packageName];
}

export function isPluginPackage(
	dirName: string,
	pkg: { ogerjs?: OgerjsPluginManifest },
): boolean {
	if (NON_PLUGIN_PACKAGES.has(dirName)) return false;
	return pkg.ogerjs?.plugin === true;
}
