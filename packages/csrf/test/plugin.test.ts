import { describe } from "bun:test";
import { csrf } from "@ogerjs/csrf";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find((p) => p.packageName === "@ogerjs/csrf")!;

describe("@ogerjs/csrf", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/csrf"];
	runPluginBehaviorTests({
		name: "@ogerjs/csrf",
		factory: csrf,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
