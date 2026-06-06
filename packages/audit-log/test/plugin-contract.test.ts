import { describe } from "bun:test";
import { auditLog } from "@ogerjs/audit-log";
import { discoverPlugins, runPluginBehaviorTests } from "@ogerjs/testing";

const plugin = discoverPlugins().find(
	(p) => p.packageName === "@ogerjs/audit-log",
)!;

describe("@ogerjs/audit-log contract", () => {
	runPluginBehaviorTests({
		name: "@ogerjs/audit-log",
		factory: auditLog,
		scoped: plugin.manifest.scoped,
		testInvoke: plugin.testInvoke ?? { sink: () => {} },
	});
});
