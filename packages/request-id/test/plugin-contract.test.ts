import { describe } from "bun:test";
import { requestId } from "@ogerjs/request-id";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/request-id",
)!;

describe("@ogerjs/request-id contract", () => {
	runPluginBehaviorTests({
		name: "@ogerjs/request-id",
		factory: requestId,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
	});
});
