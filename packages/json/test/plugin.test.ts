import { describe } from "bun:test";
import { json } from "@ogerjs/json";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find((p) => p.packageName === "@ogerjs/json")!;

describe("@ogerjs/json", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/json"];
	runPluginBehaviorTests({
		name: "@ogerjs/json",
		factory: json,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
