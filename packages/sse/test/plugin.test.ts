import { describe } from "bun:test";
import { sse } from "@ogerjs/sse";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find((p) => p.packageName === "@ogerjs/sse")!;

describe("@ogerjs/sse", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/sse"];
	runPluginBehaviorTests({
		name: "@ogerjs/sse",
		factory: sse,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
