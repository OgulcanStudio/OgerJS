import { describe } from "bun:test";
import { rateLimit } from "@ogerjs/rate-limit";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";
import { PLUGIN_TEST_CASES } from "../../testing/test/plugin-cases";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/rate-limit",
)!;

describe("@ogerjs/rate-limit", () => {
	const spec = PLUGIN_TEST_CASES["@ogerjs/rate-limit"];
	runPluginBehaviorTests({
		name: "@ogerjs/rate-limit",
		factory: rateLimit,
		smokePath: spec?.smokePath,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
		cases: spec?.cases,
	});
});
