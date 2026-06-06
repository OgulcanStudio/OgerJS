import { describe } from "bun:test";
import { compress } from "@ogerjs/compress";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/compress",
)!;

describe("@ogerjs/compress", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/compress"];
	runPluginBehaviorTests({
		name: "@ogerjs/compress",
		factory: compress,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
