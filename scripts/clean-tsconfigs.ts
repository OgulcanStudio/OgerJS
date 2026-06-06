import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_ROOT = join(import.meta.dir, "../packages");

function cleanTsConfigs() {
	const entries = readdirSync(PACKAGES_ROOT, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const tsconfigPath = join(PACKAGES_ROOT, entry.name, "tsconfig.json");
		if (!existsSync(tsconfigPath)) continue;

		const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as Record<
			string,
			any
		>;
		if (tsconfig.include) {
			tsconfig.include = ["src/**/*"];
			writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
			console.log(`Cleaned tsconfig for ${entry.name}`);
		}
	}
}

cleanTsConfigs();
