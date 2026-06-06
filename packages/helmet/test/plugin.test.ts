import { describe } from "bun:test";
import { helmet } from "@ogerjs/helmet";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/helmet",
)!;

describe("@ogerjs/helmet", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/helmet"];
	runPluginBehaviorTests({
		name: "@ogerjs/helmet",
		factory: helmet,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
