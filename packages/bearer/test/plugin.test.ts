import { describe } from "bun:test";
import { bearer } from "@ogerjs/bearer";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/bearer",
)!;

describe("@ogerjs/bearer", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/bearer"];
	runPluginBehaviorTests({
		name: "@ogerjs/bearer",
		factory: bearer,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
