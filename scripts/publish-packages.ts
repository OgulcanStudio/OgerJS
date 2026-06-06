import { spawn } from "node:child_process";
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

const PACKAGES_ROOT = join(import.meta.dir, "../packages");
const STAGING_ROOT = join(import.meta.dir, "../.publish-staging");
const DRY_RUN = !process.argv.includes("--yes");
const SKIP_BUILD = process.argv.includes("--skip-build");
const SKIP_STAMP = process.argv.includes("--skip-stamp");

function run(cmd: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
		proc.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} ${args.join(" ")} failed (${code})`));
		});
	});
}

function sortPackages(
	packages: Record<string, { dir: string; deps: string[] }>,
): string[] {
	const visited = new Set<string>();
	const temp = new Set<string>();
	const order: string[] = [];

	function visit(name: string) {
		if (temp.has(name)) {
			throw new Error(`Circular dependency: ${name}`);
		}
		if (visited.has(name)) return;
		temp.add(name);
		const pkg = packages[name];
		if (pkg) {
			for (const dep of pkg.deps) {
				if (packages[dep]) visit(dep);
			}
		}
		temp.delete(name);
		visited.add(name);
		order.push(name);
	}

	for (const name of Object.keys(packages)) visit(name);
	return order;
}

function resolveWorkspaceDeps(
	deps: Record<string, string> | undefined,
	version: string,
): Record<string, string> | undefined {
	if (!deps) return deps;
	const out: Record<string, string> = {};
	for (const [name, range] of Object.entries(deps)) {
		out[name] = range === "workspace:*" ? `^${version}` : range;
	}
	return out;
}

function stagePackage(dir: string, pkg: Record<string, unknown>): string {
	const srcDir = join(PACKAGES_ROOT, dir);
	const destDir = join(STAGING_ROOT, dir);
	rmSync(destDir, { recursive: true, force: true });
	mkdirSync(destDir, { recursive: true });
	cpSync(join(srcDir, "dist"), join(destDir, "dist"), { recursive: true });
	const scripts = { ...(pkg.scripts as Record<string, string> | undefined) };
	delete scripts.prepublishOnly;
	const publishable = {
		...pkg,
		scripts,
		dependencies: resolveWorkspaceDeps(
			pkg.dependencies as Record<string, string> | undefined,
			String(pkg.version),
		),
		peerDependencies: resolveWorkspaceDeps(
			pkg.peerDependencies as Record<string, string> | undefined,
			String(pkg.version),
		),
		devDependencies: undefined,
	};
	writeFileSync(
		join(destDir, "package.json"),
		`${JSON.stringify(publishable, null, "\t")}\n`,
	);
	const license = join(import.meta.dir, "../LICENSE");
	if (existsSync(license)) {
		cpSync(license, join(destDir, "LICENSE"));
	}
	return destDir;
}

async function main() {
	console.log(
		DRY_RUN
			? "Dry run — pass --yes to publish to npm (requires npm login as ogulcanstudio)\n"
			: "Publishing to npm registry as Ogulcan Studio…\n",
	);

	if (!SKIP_STAMP) {
		await run("bun", ["run", "scripts/stamp-npm-meta.ts"], join(import.meta.dir, ".."));
	}
	if (!SKIP_BUILD) {
		await run("bun", ["run", "build"], join(import.meta.dir, ".."));
	}

	rmSync(STAGING_ROOT, { recursive: true, force: true });
	mkdirSync(STAGING_ROOT, { recursive: true });

	const packages: Record<string, { dir: string; deps: string[] }> = {};
	for (const entry of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const pkgJsonPath = join(PACKAGES_ROOT, entry.name, "package.json");
		if (!existsSync(pkgJsonPath)) continue;
		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
			name?: string;
			version?: string;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		if (!pkg.name || !pkg.version) continue;
		const deps = [
			...Object.keys(pkg.dependencies ?? {}),
			...Object.keys(pkg.peerDependencies ?? {}),
		].filter((d) => d.startsWith("@ogerjs/"));
		packages[pkg.name] = { dir: entry.name, deps };
	}

	const order = sortPackages(packages);
	for (const name of order) {
		const { dir } = packages[name]!;
		const pkgJsonPath = join(PACKAGES_ROOT, dir, "package.json");
		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as Record<
			string,
			unknown
		>;
		const distDir = join(PACKAGES_ROOT, dir, "dist");
		if (!existsSync(distDir)) {
			console.warn(`Skipping ${name}: missing dist/`);
			continue;
		}

		const staged = stagePackage(dir, pkg);
		const args = DRY_RUN ? ["publish", "--dry-run"] : ["publish", "--access", "public"];
		console.log(`\n→ ${name}@${pkg.version}`);
		await run("npm", args, staged);
	}

	rmSync(STAGING_ROOT, { recursive: true, force: true });

	console.log(
		DRY_RUN
			? "\nDry run complete. Login: npm login  then  bun run publish:packages -- --yes"
			: "\nAll packages published.",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
