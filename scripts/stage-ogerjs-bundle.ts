import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	NPM_FRAMEWORK_PACKAGE,
	OGERJS_BUNDLE_DIRS,
	rewriteWorkspaceImports,
} from "./npm-registry-names";

const PACKAGES_ROOT = join(import.meta.dir, "../packages");
const STAGING_ROOT = join(import.meta.dir, "../.publish-staging");
const BUNDLE_ROOT = join(STAGING_ROOT, NPM_FRAMEWORK_PACKAGE);

function rewriteTree(dir: string) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			rewriteTree(path);
			continue;
		}
		if (!entry.name.endsWith(".js") && !entry.name.endsWith(".d.ts")) continue;
		const content = readFileSync(path, "utf8");
		const next = rewriteWorkspaceImports(content);
		if (next !== content) writeFileSync(path, next, "utf8");
	}
}

function buildExports(): Record<string, { types: string; default: string }> {
	const exports: Record<string, { types: string; default: string }> = {};
	for (const dir of OGERJS_BUNDLE_DIRS) {
		const subpath = dir === "core" ? "." : `./${dir}`;
		const prefix = dir === "core" ? "dist" : `dist/${dir}`;
		exports[subpath] = {
			types: `./${prefix}/index.d.ts`,
			default: `./${prefix}/index.js`,
		};
	}
	return exports;
}

export function stageOgerjsBundle(): string {
	rmSync(BUNDLE_ROOT, { recursive: true, force: true });
	mkdirSync(join(BUNDLE_ROOT, "dist"), { recursive: true });

	for (const dir of OGERJS_BUNDLE_DIRS) {
		const srcDist = join(PACKAGES_ROOT, dir, "dist");
		if (!existsSync(srcDist)) {
			throw new Error(`Missing build output: packages/${dir}/dist`);
		}
		const dest =
			dir === "core" ? join(BUNDLE_ROOT, "dist") : join(BUNDLE_ROOT, "dist", dir);
		cpSync(srcDist, dest, { recursive: true });
	}

	rewriteTree(join(BUNDLE_ROOT, "dist"));

	const cliSrc = join(PACKAGES_ROOT, "create-oger", "dist");
	if (!existsSync(cliSrc)) {
		throw new Error("Missing build output: packages/create-oger/dist");
	}
	const cliDest = join(BUNDLE_ROOT, "dist", "cli");
	cpSync(cliSrc, cliDest, { recursive: true });
	rewriteTree(cliDest);

	const corePkg = JSON.parse(
		readFileSync(join(PACKAGES_ROOT, "core", "package.json"), "utf8"),
	) as {
		version: string;
		engines?: Record<string, string>;
	};

	const packageJson = {
		name: NPM_FRAMEWORK_PACKAGE,
		version: corePkg.version,
		type: "module",
		description:
			"Ultra-fast Bun-native HTTP framework with fluent macros, composable plugins, zero runtime deps, and native Bun.serve routing.",
		main: "./dist/index.js",
		types: "./dist/index.d.ts",
		bin: {
			ogerjs: "./dist/cli/cli.js",
			"oger-doctor": "./dist/cli/doctor.js",
		},
		exports: buildExports(),
		engines: corePkg.engines,
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
		keywords: [
			"ogerjs",
			"bun",
			"http",
			"typescript",
			"framework",
			"router",
			"validation",
			"openapi",
			"performance",
		],
	};

	writeFileSync(
		join(BUNDLE_ROOT, "package.json"),
		`${JSON.stringify(packageJson, null, "\t")}\n`,
	);

	const license = join(import.meta.dir, "../LICENSE");
	if (existsSync(license)) {
		cpSync(license, join(BUNDLE_ROOT, "LICENSE"));
	}

	return BUNDLE_ROOT;
}
