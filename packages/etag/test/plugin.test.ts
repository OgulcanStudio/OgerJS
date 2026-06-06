import { describe } from "bun:test";
import { etag } from "@ogerjs/etag";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find((p) => p.packageName === "@ogerjs/etag")!;

describe("@ogerjs/etag", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/etag"];
	runPluginBehaviorTests({
		name: "@ogerjs/etag",
		factory: etag,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
