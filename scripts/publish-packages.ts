import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { NPM_FRAMEWORK_PACKAGE, NPM_PUBLISHER } from "./npm-registry-names";
import { stageOgerjsBundle } from "./stage-ogerjs-bundle";

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

function assertNpmPublisher() {
	let whoami: string;
	try {
		whoami = execSync("npm whoami", { encoding: "utf8" }).trim();
	} catch {
		throw new Error(
			`Not logged in to npm. Run: npm login  (publish as ${NPM_PUBLISHER})`,
		);
	}
	if (whoami !== NPM_PUBLISHER) {
		throw new Error(
			`Expected npm user "${NPM_PUBLISHER}", got "${whoami}". Packages publish to https://www.npmjs.com/~${NPM_PUBLISHER}`,
		);
	}
}

async function main() {
	console.log(
		DRY_RUN
			? `Dry run — pass --yes to publish ${NPM_FRAMEWORK_PACKAGE} to npm (login: ${NPM_PUBLISHER})\n`
			: `Publishing ${NPM_FRAMEWORK_PACKAGE} to npm as ${NPM_PUBLISHER} (Ogulcan Studio)…\n`,
	);

	if (!DRY_RUN) {
		assertNpmPublisher();
	}

	if (!SKIP_STAMP) {
		await run("bun", ["run", "scripts/stamp-npm-meta.ts"], join(import.meta.dir, ".."));
	}
	if (!SKIP_BUILD) {
		await run("bun", ["run", "build"], join(import.meta.dir, ".."));
	}

	const cliDist = join(PACKAGES_ROOT, "create-oger", "dist");
	if (!existsSync(cliDist)) {
		throw new Error("Missing build output: packages/create-oger/dist");
	}

	rmSync(STAGING_ROOT, { recursive: true, force: true });
	mkdirSync(STAGING_ROOT, { recursive: true });

	const stagedDir = stageOgerjsBundle();
	const { version } = JSON.parse(
		readFileSync(join(PACKAGES_ROOT, "core", "package.json"), "utf8"),
	) as { version: string };

	const args = DRY_RUN ? ["publish", "--dry-run"] : ["publish"];
	console.log(`\n→ ${NPM_FRAMEWORK_PACKAGE}@${version}`);
	await run("npm", args, stagedDir);

	rmSync(STAGING_ROOT, { recursive: true, force: true });

	console.log(
		DRY_RUN
			? `\nDry run complete. Login: npm login  then  bun run publish:packages -- --yes`
			: `\nPublished ${NPM_FRAMEWORK_PACKAGE}@${version} to https://www.npmjs.com/package/${NPM_FRAMEWORK_PACKAGE}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
