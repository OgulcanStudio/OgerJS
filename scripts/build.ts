import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_ROOT = join(import.meta.dir, "../packages");

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, { cwd });
		let stderr = "";
		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});
		proc.on("close", (code) => {
			if (code === 0) resolve();
			else {
				reject(
					new Error(
						`Command ${cmd} ${args.join(" ")} failed with exit code ${code}.\nStderr: ${stderr}`,
					),
				);
			}
		});
	});
}

async function buildPackage(dirName: string) {
	const pkgDir = join(PACKAGES_ROOT, dirName);
	const pkgJsonPath = join(pkgDir, "package.json");
	if (!existsSync(pkgJsonPath)) return;

	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
		name?: string;
		dependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	if (!pkg.name) return;

	console.log(`Building package: ${pkg.name}...`);

	const isCli = dirName === "create-oger";
	const isCompat = dirName === "compat";
	const entrypoints = [join(pkgDir, "src/index.ts")];
	if (isCli) {
		entrypoints.push(join(pkgDir, "src/cli.ts"));
		entrypoints.push(join(pkgDir, "src/doctor.ts"));
	} else if (isCompat) {
		entrypoints.push(join(pkgDir, "src/register.ts"));
		entrypoints.push(join(pkgDir, "src/loader.ts"));
		entrypoints.push(join(pkgDir, "src/bun-shim.ts"));
		entrypoints.push(join(pkgDir, "src/sqlite.ts"));
		entrypoints.push(join(pkgDir, "src/jsc.ts"));
		entrypoints.push(join(pkgDir, "src/ffi.ts"));
		entrypoints.push(join(pkgDir, "src/test-shim.ts"));
		entrypoints.push(join(pkgDir, "src/node-sqlite-shim.ts"));
	}


	// 1. Compile JS bundle using Bun.build
	const externals = [
		...(pkg.dependencies ? Object.keys(pkg.dependencies) : []),
		...(pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []),
		...(pkg.devDependencies ? Object.keys(pkg.devDependencies) : []),
	];

	for (const entrypoint of entrypoints) {
		const result = await Bun.build({
			entrypoints: [entrypoint],
			outdir: join(pkgDir, "dist"),
			target: isCli ? "node" : "bun",
			format: "esm",
			external: externals,
			sourcemap: "none",
		});

		if (!result.success) {
			console.error(`Error building ${pkg.name} (${entrypoint}):`, result.logs);
			throw new Error(`Bun.build failed for ${pkg.name}`);
		}
	}

	// 2. Generate TS declaration files (.d.ts) using tsc
	const tscPath = join(PACKAGES_ROOT, "../node_modules/typescript/lib/tsc.js");
	await runCommand(
		"node",
		[
			tscPath,
			"-p",
			"tsconfig.json",
			"--noEmit",
			"false",
			"--emitDeclarationOnly",
			"--outDir",
			"dist",
		],
		pkgDir,
	);

	// 3. Setup permissions and shebang for CLI binaries
	if (isCli) {
		const fs = await import("node:fs/promises");
		const cliPath = join(pkgDir, "dist/cli.js");
		const doctorPath = join(pkgDir, "dist/doctor.js");

		for (const path of [cliPath, doctorPath]) {
			if (existsSync(path)) {
				let content = await fs.readFile(path, "utf8");
				if (content.startsWith("#!")) {
					content = content.replace(/^#![^\n]*\n/, "");
				}
				await fs.writeFile(path, `#!/usr/bin/env node\n${content}`, "utf8");
				await fs.chmod(path, 0o755);
				console.log(`Prepend shebang and marked executable: ${path}`);
			}
		}
	}
}

// Depth-first search topological sort
function sortPackages(
	packages: Record<string, { dir: string; deps: string[] }>,
): string[] {
	const visited = new Set<string>();
	const temp = new Set<string>();
	const order: string[] = [];

	function visit(name: string) {
		if (temp.has(name)) {
			throw new Error(
				`Circular dependency detected involving package: ${name}`,
			);
		}
		if (visited.has(name)) return;

		temp.add(name);
		const pkg = packages[name];
		if (pkg) {
			for (const dep of pkg.deps) {
				if (packages[dep]) {
					visit(dep);
				}
			}
		}
		temp.delete(name);
		visited.add(name);
		order.push(name);
	}

	for (const name of Object.keys(packages)) {
		visit(name);
	}

	return order;
}

async function main() {
	const cwd = process.cwd();
	const parts = cwd.split(/[\\/]/);
	const pkgIdx = parts.lastIndexOf("packages");
	const runFromPkg =
		pkgIdx >= 0 && pkgIdx < parts.length - 1 ? parts[pkgIdx + 1] : null;

	if (runFromPkg) {
		console.log(`Building single package: @ogerjs/${runFromPkg}`);
		await buildPackage(runFromPkg);
		return;
	}

	const entries = readdirSync(PACKAGES_ROOT, { withFileTypes: true });
	const packages: Record<string, { dir: string; deps: string[] }> = {};

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const pkgJsonPath = join(PACKAGES_ROOT, entry.name, "package.json");
		if (!existsSync(pkgJsonPath)) continue;

		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
			name?: string;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		if (!pkg.name) continue;

		const deps = [
			...Object.keys(pkg.dependencies ?? {}),
			...Object.keys(pkg.peerDependencies ?? {}),
		].filter((d) => d.startsWith("@ogerjs/"));

		packages[pkg.name] = {
			dir: entry.name,
			deps,
		};
	}

	const buildOrder = sortPackages(packages);
	console.log(
		`Discovered ${buildOrder.length} packages. Topological build order:`,
	);
	console.log(buildOrder.map((p) => packages[p]?.dir).join(" -> "));

	const start = performance.now();
	for (const pkgName of buildOrder) {
		const pkg = packages[pkgName]!;
		await buildPackage(pkg.dir);
	}

	console.log(
		`Build completed in ${((performance.now() - start) / 1000).toFixed(2)}s`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
