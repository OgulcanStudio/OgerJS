import { describe } from "bun:test";
import { cookie } from "@ogerjs/cookie";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/cookie",
)!;

describe("@ogerjs/cookie", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/cookie"];
	runPluginBehaviorTests({
		name: "@ogerjs/cookie",
		factory: cookie,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
