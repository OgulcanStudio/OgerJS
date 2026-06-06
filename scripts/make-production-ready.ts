import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_ROOT = join(import.meta.dir, "../packages");

function updatePackages() {
	const entries = readdirSync(PACKAGES_ROOT, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dirName = entry.name;
		const pkgDir = join(PACKAGES_ROOT, dirName);
		const pkgJsonPath = join(pkgDir, "package.json");
		if (!existsSync(pkgJsonPath)) continue;

		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as Record<
			string,
			any
		>;
		const hasIndex = existsSync(join(pkgDir, "src/index.ts"));

		if (hasIndex) {
			pkg.main = "./dist/index.js";
			pkg.types = "./dist/index.d.ts";
			pkg.exports = {
				".": {
					types: "./dist/index.d.ts",
					default: "./dist/index.js",
				},
			};
		}

		// Standardize scripts
		pkg.scripts = pkg.scripts ?? {};
		pkg.scripts.build = "bun run ../../scripts/build.ts";

		// Add testing dependency to all packages except testing itself
		if (dirName !== "testing") {
			pkg.devDependencies = pkg.devDependencies ?? {};
			pkg.devDependencies["@ogerjs/testing"] = "workspace:*";
		}

		writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
		console.log(`Successfully updated package.json for ${pkg.name ?? dirName}`);
	}
}

updatePackages();
