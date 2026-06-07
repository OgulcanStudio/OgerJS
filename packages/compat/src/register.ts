import * as nodeModule from "node:module";
import { createRequire } from "node:module";

const { register } = nodeModule;
type RegisterHooksFn = (options: {
	resolve?: (specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => unknown) => unknown;
	load?: (url: string, context: unknown, nextLoad: (url: string, context: unknown) => unknown) => unknown;
}) => { deregister: () => void };
const registerHooks = (nodeModule as { registerHooks?: RegisterHooksFn }).registerHooks;
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { loadSync, resolveSync } from "./loader";
import "./bun-shim";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isBun = typeof process !== "undefined" && process.versions !== undefined && process.versions.bun !== undefined;

function resolveCompatPath(name: string): string {
	const tsPath = path.resolve(__dirname, `${name}.ts`);
	if (fs.existsSync(tsPath)) {
		return tsPath;
	}
	return path.resolve(__dirname, `${name}.js`);
}

if (!isBun) {
	try {
		if (typeof registerHooks === "function") {
			registerHooks({ resolve: resolveSync, load: loadSync });
		} else {
			const loaderUrl = new URL("./loader.js", import.meta.url).href;
			register(loaderUrl);
		}
	} catch (err) {
		console.error("LOADER REGISTRATION FAILED:", err);
	}
}

try {
	const require = createRequire(import.meta.url);
	const Module = require("module");
	const originalResolveFilename = Module._resolveFilename;

	Module._resolveFilename = function (
		request: string,
		parent: any,
		isMain: boolean,
		options: any,
	) {
		if (isBun) {
			if (request === "node:sqlite") {
				return resolveCompatPath("node-sqlite-shim");
			}
		} else {
			if (request === "bun") {
				return resolveCompatPath("bun-shim");
			}
			if (request === "bun:sqlite") {
				return resolveCompatPath("sqlite");
			}
			if (request === "bun:jsc") {
				return resolveCompatPath("jsc");
			}
			if (request === "bun:ffi") {
				return resolveCompatPath("ffi");
			}
			if (request === "bun:test") {
				return resolveCompatPath("test-shim");
			}
		}
		return originalResolveFilename.apply(this, arguments);
	};
} catch (err) {
	// Fallback/ignore if CommonJS patching fails
}

if (isBun) {
	try {
		const BunGlobal = (globalThis as any).Bun;
		if (BunGlobal.plugin) {
			BunGlobal.plugin({
				name: "node-sqlite-compat-plugin",
				setup(build: any) {
					build.onResolve({ filter: /^node:sqlite$/ }, () => {
						return {
							path: resolveCompatPath("node-sqlite-shim"),
						};
					});
				},
			});
		}
	} catch (err) {
		// Ignore
	}
}
