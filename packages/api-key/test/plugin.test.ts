import { describe } from "bun:test";
import { apiKey } from "@ogerjs/api-key";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/api-key",
)!;

describe("@ogerjs/api-key", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/api-key"];
	runPluginBehaviorTests({
		name: "@ogerjs/api-key",
		factory: apiKey,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
