import { describe } from "bun:test";
import { logger } from "@ogerjs/logger";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/logger",
)!;

describe("@ogerjs/logger", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/logger"];
	runPluginBehaviorTests({
		name: "@ogerjs/logger",
		factory: logger,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
