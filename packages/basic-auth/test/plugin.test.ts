import { describe } from "bun:test";
import { basicAuth } from "@ogerjs/basic-auth";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/basic-auth",
)!;

describe("@ogerjs/basic-auth", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/basic-auth"];
	runPluginBehaviorTests({
		name: "@ogerjs/basic-auth",
		factory: basicAuth,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
