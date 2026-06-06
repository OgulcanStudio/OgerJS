import { describe } from "bun:test";
import { idempotency } from "@ogerjs/idempotency";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/idempotency",
)!;

describe("@ogerjs/idempotency contract", () => {
	runPluginBehaviorTests({
		name: "@ogerjs/idempotency",
		factory: idempotency,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke,
	});
});
