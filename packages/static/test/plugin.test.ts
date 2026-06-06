import { describe } from "bun:test";
import { staticPlugin } from "@ogerjs/static";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/static",
)!;

describe("@ogerjs/static", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/static"];
	runPluginBehaviorTests({
		name: "@ogerjs/static",
		factory: staticPlugin,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
