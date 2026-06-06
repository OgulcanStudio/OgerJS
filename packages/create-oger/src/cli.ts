#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runOgerDoctor } from "./doctor";

const args = process.argv.slice(2);
const yes = args.includes("--yes") || args.includes("-y");

const TEMPLATES: Record<
	string,
	{
		pkg: { dependencies: Record<string, string> };
		index: string;
		extra?: Record<string, string>;
	}
> = {
	api: {
		pkg: {
			dependencies: {
				ogerjs: "^0.1.2",
			},
		},
		index: `import { Oger, t } from "ogerjs";
import { health } from "ogerjs/health";

const app = new Oger()
  .use(health())
  .get("/", () => ({ ok: true }))
  .post("/echo", ({ body }) => body, {
    body: t.Object({ message: t.String() }),
  });

app.listen(Number(process.env.PORT ?? 3000));
console.log(\`OgerJS listening on http://localhost:\${app.port ?? 3000}\`);
`,
	},
	auth: {
		pkg: {
			dependencies: {
				ogerjs: "^0.1.2",
			},
		},
		index: `import { Oger, t } from "ogerjs";
import { jwt } from "ogerjs/jwt";
import { bearer } from "ogerjs/bearer";

const app = new Oger()
  .use(jwt({ secret: process.env.JWT_SECRET ?? "dev-secret" }))
  .use(bearer())
  .post("/login", ({ body }) => ({ token: "demo" }), {
    body: t.Object({ email: t.String(), password: t.String() }),
  })
  .get("/me", (ctx) => {
    return { user: "demo" };
  });

app.listen(Number(process.env.PORT ?? 3000));
console.log(\`OgerJS listening on http://localhost:\${app.port ?? 3000}\`);
`,
	},
	microservice: {
		pkg: {
			dependencies: {
				ogerjs: "^0.1.2",
			},
		},
		index: `import { Oger } from "ogerjs";
import { health } from "ogerjs/health";
import { logger } from "ogerjs/logger";

const app = new Oger()
  .use(logger())
  .use(health())
  .get("/", () => ({ service: "oger-service" }));

app.listen(Number(process.env.PORT ?? 3000));
console.log(\`OgerJS listening on http://localhost:\${app.port ?? 3000}\`);
`,
	},
};

function featureScaffold(featureName: string) {
	const base = featureName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
	return {
		[`src/features/${base}/routes.ts`]: `import { Oger, t } from "@ogerjs/core";

export function register${base.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}Routes(app: Oger) {
  return app
    .get("/${base}", () => ({ feature: "${base}" }))
    .post("/${base}", ({ body }) => body, {
      body: t.Object({ name: t.String() }),
      meta: { summary: "Create ${base}" },
    });
}
`,
		[`src/features/${base}/${base.replace(/-/g, "")}.service.ts`]: `export function create${base.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}Service() {
  return {
    list() {
      return [];
    },
  };
}
`,
		[`test/${base}.test.ts`]: `import { describe, expect, test } from "bun:test";
import { Oger } from "@ogerjs/core";
import { register${base.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}Routes } from "../src/features/${base}/routes";

describe("${base}", () => {
  test("GET /${base}", async () => {
    const app = register${base.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}Routes(new Oger());
    const res = await app.inject("/${base}");
    expect(res.status).toBe(200);
  });
});
`,
	};
}

function pluginScaffold(pluginName: string) {
	const pkgName = pluginName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
	const exportName = pkgName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	return {
		[`packages/${pkgName}/package.json`]: JSON.stringify(
			{
				name: `@ogerjs/${pkgName}`,
				version: "0.1.0",
				type: "module",
				main: "./dist/index.js",
				types: "./dist/index.d.ts",
				exports: {
					".": {
						types: "./dist/index.d.ts",
						default: "./dist/index.js",
					},
				},
				dependencies: { "@ogerjs/core": "workspace:*" },
				devDependencies: { "@ogerjs/testing": "workspace:*" },
				ogerjs: { plugin: true, export: exportName, scope: "global" },
				scripts: {
					typecheck: "tsc --noEmit -p tsconfig.json",
					build: "bun run ../../scripts/build.ts",
					test: "bun test",
				},
			},
			null,
			2,
		),
		[`packages/${pkgName}/tsconfig.json`]: `{ "extends": "../../tsconfig.base.json", "include": ["src/**/*"] }\n`,
		[`packages/${pkgName}/src/index.ts`]: `import { definePluginWithOptionalOptions } from "@ogerjs/core";

export interface ${exportName[0]?.toUpperCase()}${exportName.slice(1)}Options {}

export const ${exportName} = definePluginWithOptionalOptions<${exportName[0]?.toUpperCase()}${exportName.slice(1)}Options>(
  { name: "@ogerjs/${pkgName}", scope: "global" },
  (app) => app.get("/${pkgName}", () => ({ plugin: "${pkgName}" })),
  {},
);
`,
		[`packages/${pkgName}/test/plugin.test.ts`]: `import { describe } from "bun:test";
import { runPluginBehaviorTests, discoverPlugins } from "@ogerjs/testing";
import { ${exportName} } from "../src";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(p => p.packageName === "@ogerjs/${pkgName}")!;

describe("@ogerjs/${pkgName}", () => {
  const spec = PLUGIN_TEST_CASES["@ogerjs/${pkgName}"];
  runPluginBehaviorTests({
    name: "@ogerjs/${pkgName}",
    factory: ${exportName},
    smokePath: spec?.smokePath ?? "/${pkgName}",
    scoped: plugin?.manifest.scoped,
    testInvoke: plugin?.testInvoke,
    cases: spec?.cases,
  });
});
`,
	};
}

async function runCreateProject(projectName: string, runtime: string, templateName = "api") {
	const dir = join(process.cwd(), projectName);
	const isNode = runtime === "nodejs";

	const tpl = TEMPLATES[templateName] ?? TEMPLATES.api!;
	const pkg = {
		name: projectName,
		version: "0.1.0",
		type: "module",
		ogerjs: {
			runtime: isNode ? "nodejs" : "bunjs",
		},
		scripts: isNode
			? {
					dev: "node --experimental-strip-types --watch src/index.ts",
					start: "node --experimental-strip-types src/index.ts",
					test: 'echo "Error: no test specified" && exit 0',
				}
			: {
					dev: "bun --watch src/index.ts",
					start: "bun src/index.ts",
					test: "bun test",
				},
		dependencies: {
			...tpl.pkg.dependencies,
		},
		devDependencies: isNode
			? {
					"@types/node": "^22.0.0",
					typescript: "^5.7.0",
				}
			: {
					"@types/bun": "latest",
					typescript: "^5.7.0",
				},
	};

	await mkdir(dir, { recursive: true });
	await mkdir(join(dir, "src"), { recursive: true });
	await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
	await writeFile(join(dir, "src/index.ts"), tpl.index);
	if (tpl.extra) {
		for (const [path, content] of Object.entries(tpl.extra)) {
			const fullPath = join(dir, path);
			await mkdir(join(fullPath, ".."), { recursive: true });
			await writeFile(fullPath, content);
		}
	}
	await writeFile(
		join(dir, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					target: "ESNext",
					module: "ESNext",
					moduleResolution: "Node",
					esModuleInterop: true,
					strict: true,
					skipLibCheck: true,
				},
				include: ["src/**/*"],
			},
			null,
			2,
		),
	);
	await writeFile(
		join(dir, "README.md"),
		`# ${projectName}\n\nAn OgerJS project targeting ${runtime}.\n\nRun:\n\`\`\`bash\n${isNode ? "npm install && npm run dev" : "bun install && bun run dev"}\n\`\`\`\n`,
	);
	console.log(`Created OgerJS project ${projectName} (${runtime}) at ${dir}`);
	if (!yes) {
		console.log(
			`Run: cd ${projectName} && ${isNode ? "npm install && npm run dev" : "bun install && bun run dev"}`,
		);
	}
}

async function runRelease() {
	const fs = await import("node:fs/promises");
	const { existsSync } = await import("node:fs");
	const { execSync } = await import("node:child_process");

	// 1. Locate package.json
	let current = process.cwd();
	let pkgPath = "";
	while (true) {
		const tempPath = join(current, "package.json");
		if (existsSync(tempPath)) {
			pkgPath = tempPath;
			break;
		}
		const parent = join(current, "..");
		if (parent === current) break;
		current = parent;
	}

	if (!pkgPath) {
		console.error(
			"Error: package.json not found. Make sure you are inside an OgerJS project.",
		);
		process.exit(1);
	}

	const projectRoot = current;
	console.log(`Found project root at: ${projectRoot}`);

	// 2. Read package.json
	const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));

	// 3. Detect target runtime
	let runtime = "bunjs";
	if (pkg.ogerjs?.runtime) {
		runtime = pkg.ogerjs.runtime;
	} else {
		// Infer from scripts or dependencies
		const scriptsStr = JSON.stringify(pkg.scripts ?? {});
		if (
			!scriptsStr.includes("bun") &&
			(scriptsStr.includes("node") || scriptsStr.includes("tsx"))
		) {
			runtime = "nodejs";
		}
	}
	console.log(`Target runtime detected: ${runtime}`);

	// 4. Determine entrypoint
	let entrypoint = "";
	const entryCandidates = [
		pkg.main,
		"src/index.ts",
		"src/index.js",
		"index.ts",
		"index.js",
	];
	for (const candidate of entryCandidates) {
		if (candidate && existsSync(join(projectRoot, candidate))) {
			entrypoint = candidate;
			break;
		}
	}

	if (!entrypoint) {
		console.error(
			"Error: Could not find project entrypoint (tried main field, src/index.ts, etc.)",
		);
		process.exit(1);
	}
	console.log(`Entrypoint file: ${entrypoint}`);

	// 5. Clean and create ready-to-release folder
	const releaseDir = join(projectRoot, "ready-to-release");
	if (existsSync(releaseDir)) {
		await fs.rm(releaseDir, { recursive: true, force: true });
	}
	await fs.mkdir(releaseDir, { recursive: true });

	// 6. Check for bun availability
	let hasBun = false;
	try {
		execSync("bun --version", { stdio: "ignore" });
		hasBun = true;
	} catch {}

	let wasBundled = false;
	const outEntryFile = "index.js";

	if (hasBun) {
		console.log("Using Bun to bundle the project...");
		const target = runtime === "nodejs" ? "node" : "bun";
		try {
			execSync(
				`bun build ${join(projectRoot, entrypoint)} --outdir ${releaseDir} --target ${target} --minify`,
				{ stdio: "inherit" },
			);
			wasBundled = true;
			console.log(`Successfully bundled to ${join(releaseDir, outEntryFile)}`);
		} catch (err) {
			console.warn("Bun build failed. Falling back to tsc compilation...", err);
		}
	}

	if (!wasBundled) {
		console.log("Compiling project using TypeScript (tsc)...");
		try {
			let tscCmd = "npx tsc";
			const localTsc = join(projectRoot, "node_modules/.bin/tsc");
			if (existsSync(localTsc)) {
				tscCmd = localTsc;
			}
			execSync(
				`${tscCmd} --outDir ${releaseDir} --target ESNext --module ESNext --moduleResolution Node`,
				{ stdio: "inherit" },
			);
			console.log("Compilation complete.");
		} catch (err) {
			console.error("Error compiling project:", err);
			process.exit(1);
		}
	}

	// 7. Copy assets
	const copyCandidates = ["static", "public", ".env", ".env.example"];
	for (const candidate of copyCandidates) {
		const src = join(projectRoot, candidate);
		if (existsSync(src)) {
			const dest = join(releaseDir, candidate);
			await fs.cp(src, dest, { recursive: true });
			console.log(`Copied ${candidate} to release folder`);
		}
	}

	// 8. Generate package.json in release folder
	const entryFile = wasBundled ? "index.js" : entrypoint.replace(/\.ts$/, ".js");
	const startCmd = runtime === "bunjs" ? `bun ${entryFile}` : `node ${entryFile}`;

	const releasePkg: Record<string, any> = {
		name: `${pkg.name ?? "oger-app"}-release`,
		version: pkg.version ?? "0.1.0",
		type: "module",
		scripts: {
			start: startCmd,
		},
	};

	if (!wasBundled) {
		// Copy dependencies if not bundled
		releasePkg.dependencies = pkg.dependencies;
	} else {
		// If bundled, keep only non-oger dependencies
		if (pkg.dependencies) {
			const extDeps: Record<string, string> = {};
			for (const [dep, ver] of Object.entries(pkg.dependencies)) {
				if (!dep.startsWith("@ogerjs/")) {
					extDeps[dep] = ver as string;
				}
			}
			if (Object.keys(extDeps).length > 0) {
				releasePkg.dependencies = extDeps;
			}
		}
	}

	await fs.writeFile(
		join(releaseDir, "package.json"),
		JSON.stringify(releasePkg, null, 2),
		"utf8",
	);

	console.log(`\nProduction ready release build created at: ${releaseDir}`);
	console.log("To run the application, go to 'ready-to-release' and run:");
	if (runtime === "bunjs") {
		console.log("  bun run start");
	} else {
		console.log("  npm install (if needed) && npm run start");
	}
}

function printHelp() {
	console.log(`OgerJS CLI

Usage:
  ogerjs create-project <name> [runtime]  Create a new OgerJS template project (runtime: bunjs, nodejs)
  ogerjs release                          Build the project in release mode (creates 'ready-to-release' folder)
  ogerjs doctor                           Run health and compatibility checks on the current project
  ogerjs generate feature <name>          Generate a feature scaffold in the current project
  ogerjs generate plugin <name>           Generate a custom plugin scaffold in the current project

Options:
  --yes, -y                               Skip interactive prompts and use defaults
  --help, -h                              Show this help message`);
}

async function main() {
	const command = args[0];

	if (!command || command === "--help" || command === "-h" || command === "help") {
		printHelp();
		return;
	}

	if (command === "create-project") {
		const projectName = args[1];
		if (!projectName) {
			console.error("Error: Please specify a project name.");
			process.exit(1);
		}
		const runtime = args[2] ?? "bunjs";
		if (runtime !== "bunjs" && runtime !== "nodejs") {
			console.error("Error: Runtime must be either 'bunjs' or 'nodejs'.");
			process.exit(1);
		}
		const templateIdx = args.indexOf("--template");
		const template = templateIdx >= 0 ? args[templateIdx + 1] : "api";
		await runCreateProject(projectName, runtime, template);
		return;
	}

	if (command === "release") {
		await runRelease();
		return;
	}

	if (command === "doctor" || args.includes("--doctor")) {
		const issues = await runOgerDoctor();
		for (const i of issues) {
			console.log(`[${i.level}] ${i.code}: ${i.message}`);
		}
		if (issues.some((i) => i.level === "error")) process.exit(1);
		return;
	}

	const isGenFeature =
		(command === "generate" && args[1] === "feature") || args.includes("--feature");
	const isGenPlugin =
		(command === "generate" && args[1] === "plugin") || args.includes("--plugin");

	if (isGenFeature) {
		const featureName = args[args.length - 1];
		if (!featureName || featureName.startsWith("-") || featureName === "feature") {
			console.error("Error: Please specify a feature name.");
			process.exit(1);
		}
		const files = featureScaffold(featureName);
		for (const [path, content] of Object.entries(files)) {
			const full = join(process.cwd(), path);
			await mkdir(join(full, ".."), { recursive: true });
			await writeFile(full, content);
		}
		console.log(`Feature scaffold written under ${process.cwd()}`);
		return;
	}

	if (isGenPlugin) {
		const pluginName = args[args.length - 1];
		if (!pluginName || pluginName.startsWith("-") || pluginName === "plugin") {
			console.error("Error: Please specify a plugin name.");
			process.exit(1);
		}
		const files = pluginScaffold(pluginName);
		for (const [path, content] of Object.entries(files)) {
			const full = join(process.cwd(), path);
			await mkdir(join(full, ".."), { recursive: true });
			await writeFile(full, content);
		}
		console.log(`Plugin scaffold written for @ogerjs/${pluginName}`);
		return;
	}

	// Fallback compatibility mode: ogerjs MyProject --template api
	const templateIdx = args.indexOf("--template");
	const template = templateIdx >= 0 ? args[templateIdx + 1] : "api";
	const projectName = args.find((a) => !a.startsWith("-") && a !== template);
	if (projectName) {
		await runCreateProject(projectName, "bunjs", template);
	} else {
		printHelp();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
