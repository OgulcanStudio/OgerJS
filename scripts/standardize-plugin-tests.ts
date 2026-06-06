import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { discoverPlugins } from "../packages/testing/src/plugin-contract";

const PACKAGES_ROOT = join(import.meta.dirname, "../packages");

function main() {
	const plugins = discoverPlugins(PACKAGES_ROOT);

	console.log(`Found ${plugins.length} plugins to standardize.`);

	for (const plugin of plugins) {
		const pkgDir = join(PACKAGES_ROOT, plugin.dirName);
		const testDir = join(pkgDir, "test");

		// Ensure test directory exists
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}

		// List and delete existing files in test directory
		const existingFiles = readdirSync(testDir);
		for (const file of existingFiles) {
			const filePath = join(testDir, file);
			rmSync(filePath, { recursive: true, force: true });
			console.log(`  Deleted: ${plugin.dirName}/test/${file}`);
		}

		// Create the standardized plugin.test.ts
		const testFilePath = join(testDir, "plugin.test.ts");
		const exportName = plugin.exportName;
		const testContent = `import { describe } from "bun:test";
import { runPluginBehaviorTests, discoverPlugins } from "@ogerjs/testing";
import { ${exportName} } from "${plugin.packageName}";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(p => p.packageName === "${plugin.packageName}")!;

describe("${plugin.packageName}", () => {
  const spec = PLUGIN_TEST_CASES["${plugin.packageName}"];
  runPluginBehaviorTests({
    name: "${plugin.packageName}",
    factory: ${exportName},
    smokePath: spec?.smokePath,
    scoped: plugin.manifest.scoped,
    testInvoke: plugin.testInvoke,
    cases: spec?.cases,
  });
});
`;

		writeFileSync(testFilePath, testContent, "utf8");
		console.log(`  Created: ${plugin.dirName}/test/plugin.test.ts`);
	}

	console.log("Plugin tests standardization completed successfully!");
}

main();
