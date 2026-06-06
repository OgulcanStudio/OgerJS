import { describe } from "bun:test";
import { compat } from "@ogerjs/compat";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/compat",
)!;

describe("@ogerjs/compat", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/compat"];
	runPluginBehaviorTests({
		name: "@ogerjs/compat",
		factory: compat,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
