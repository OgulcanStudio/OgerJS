import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_ROOT = join(import.meta.dir, "../packages");
const TESTING_PKG_JSON = join(PACKAGES_ROOT, "testing/package.json");

function linkTestDeps() {
	const entries = readdirSync(PACKAGES_ROOT, { withFileTypes: true });
	const testingPkg = JSON.parse(
		readFileSync(TESTING_PKG_JSON, "utf8"),
	) as Record<string, any>;
	testingPkg.devDependencies = testingPkg.devDependencies ?? {};

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === "testing" || entry.name === "_plugin-template") continue;

		const pkgJsonPath = join(PACKAGES_ROOT, entry.name, "package.json");
		if (!existsSync(pkgJsonPath)) continue;

		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
			name?: string;
		};
		if (pkg.name?.startsWith("@ogerjs/")) {
			testingPkg.devDependencies[pkg.name] = "workspace:*";
		}
	}

	writeFileSync(TESTING_PKG_JSON, `${JSON.stringify(testingPkg, null, 2)}\n`);
	console.log("Updated testing/package.json devDependencies");
}

linkTestDeps();
