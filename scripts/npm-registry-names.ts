/** npm account that owns published OgerJS packages (https://www.npmjs.com/~ogulcanstudio). */
export const NPM_PUBLISHER = "ogulcanstudio";

/** Single published framework package on npm. */
export const NPM_FRAMEWORK_PACKAGE = "ogerjs";

/** Workspace folders bundled into `ogerjs` (excludes CLI scaffold). */
export const OGERJS_BUNDLE_DIRS = [
	"core",
	"router",
	"api-key",
	"audit-log",
	"basic-auth",
	"bearer",
	"body-limit",
	"compat",
	"compress",
	"cookie",
	"cors",
	"csrf",
	"etag",
	"events",
	"health",
	"helmet",
	"html",
	"idempotency",
	"json",
	"jwt",
	"logger",
	"rate-limit",
	"request-id",
	"sse",
	"static",
	"stream",
	"testing",
	"upload",
	"ws",
] as const;

/** Map `@ogerjs/*` workspace import to published `ogerjs` subpath. */
export function workspaceImportToPublished(importPath: string): string {
	if (importPath === "@ogerjs/core") return NPM_FRAMEWORK_PACKAGE;
	if (importPath.startsWith("@ogerjs/")) {
		return `${NPM_FRAMEWORK_PACKAGE}/${importPath.slice("@ogerjs/".length)}`;
	}
	return importPath;
}

/** Rewrite workspace import specifiers in built JS / declaration files. */
export function rewriteWorkspaceImports(content: string): string {
	return content
		.replace(/@ogerjs\/core/g, NPM_FRAMEWORK_PACKAGE)
		.replace(/@ogerjs\//g, `${NPM_FRAMEWORK_PACKAGE}/`);
}
