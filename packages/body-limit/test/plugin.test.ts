import { describe } from "bun:test";
import { bodyLimit } from "@ogerjs/body-limit";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/body-limit",
)!;

describe("@ogerjs/body-limit", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/body-limit"];
	runPluginBehaviorTests({
		name: "@ogerjs/body-limit",
		factory: bodyLimit,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
