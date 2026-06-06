import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_ROOT = join(import.meta.dir, "../packages");

const SHARED = {
	author: "Ogulcan Studio",
	license: "MIT",
	homepage: "https://ogulcan.studio",
	bugs: {
		url: "https://github.com/OgulcanStudio/OgerJS/issues",
		email: "npm@ogulcan.studio",
	},
	repository: {
		type: "git",
		url: "git+https://github.com/OgulcanStudio/OgerJS.git",
	},
	publishConfig: {
		access: "public",
		registry: "https://registry.npmjs.org/",
	},
	files: ["dist"],
} as const;

const DESCRIPTIONS: Record<string, string> = {
	"@ogerjs/core":
		"Ultra-fast Bun-native HTTP framework with fluent macros, zero runtime deps, and native Bun.serve routing.",
	"@ogerjs/router": "High-performance route compiler for OgerJS.",
	"@ogerjs/compat": "Cross-runtime helpers (Node + Bun) for OgerJS apps.",
	"@ogerjs/testing": "In-process inject() and benchRoute() utilities for OgerJS.",
	"create-oger": "Scaffold a new OgerJS API project in seconds.",
};

function pluginDescription(name: string): string {
	const short = name.replace("@ogerjs/", "");
	return `OgerJS plugin: ${short} — composable via .use(), zero extra runtime deps.`;
}

function keywords(name: string): string[] {
	const base = ["ogerjs", "bun", "http", "typescript", "framework"];
	if (name === "@ogerjs/core") {
		return [...base, "router", "validation", "openapi", "performance"];
	}
	if (name === "create-oger") {
		return [...base, "cli", "scaffold", "create-app"];
	}
	return [...base, "plugin", name.replace("@ogerjs/", "")];
}

function stampPackage(dirName: string) {
	const pkgDir = join(PACKAGES_ROOT, dirName);
	const pkgJsonPath = join(pkgDir, "package.json");
	if (!existsSync(pkgJsonPath)) return;

	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
	if (!pkg.name || typeof pkg.name !== "string") return;

	const stamped = {
		...pkg,
		...SHARED,
		description:
			DESCRIPTIONS[pkg.name] ??
			(pkg.name.startsWith("@ogerjs/")
				? pluginDescription(pkg.name)
				: "OgerJS workspace package."),
		keywords: keywords(pkg.name),
		scripts: (() => {
			const scripts = {
				...(pkg.scripts as Record<string, string> | undefined),
			};
			delete scripts.prepublishOnly;
			return scripts;
		})(),
	};

	const next = `${JSON.stringify(stamped, null, "\t")}\n`;
	if (next === readFileSync(pkgJsonPath, "utf8")) {
		console.log(`Up to date ${pkg.name}`);
		return;
	}
	writeFileSync(pkgJsonPath, next, "utf8");
	console.log(`Stamped ${pkg.name}`);
}

const entries = readdirSync(PACKAGES_ROOT, { withFileTypes: true });
for (const entry of entries) {
	if (entry.isDirectory()) stampPackage(entry.name);
}
