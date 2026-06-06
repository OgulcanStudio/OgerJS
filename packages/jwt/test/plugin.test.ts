import { describe } from "bun:test";
import { jwt } from "@ogerjs/jwt";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find((p) => p.packageName === "@ogerjs/jwt")!;

describe("@ogerjs/jwt", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/jwt"];
	runPluginBehaviorTests({
		name: "@ogerjs/jwt",
		factory: jwt,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
