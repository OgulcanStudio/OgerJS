import { describe } from "bun:test";
import { health } from "@ogerjs/health";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/health",
)!;

describe("@ogerjs/health", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/health"];
	runPluginBehaviorTests({
		name: "@ogerjs/health",
		factory: health,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
