import { describe } from "bun:test";
import { cors } from "@ogerjs/cors";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find((p) => p.packageName === "@ogerjs/cors")!;

describe("@ogerjs/cors", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/cors"];
	runPluginBehaviorTests({
		name: "@ogerjs/cors",
		factory: cors,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
