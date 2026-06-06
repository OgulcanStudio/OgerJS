import { describe } from "bun:test";
import {
	definePluginContractSuite,
	discoverPlugins,
	runPluginBehaviorTests,
} from "../src";
import { PLUGIN_TEST_CASES } from "./plugin-cases";

const plugins = discoverPlugins();

describe("@ogerjs/plugins contract", () => {
	// 1. Run basic layout and instantiation contract tests for all plugins
	definePluginContractSuite(plugins);

	// 2. Run detailed behavioral tests for plugins via the main template
	for (const plugin of plugins) {
		const spec = PLUGIN_TEST_CASES[plugin.packageName];
		if (spec) {
			describe(`${plugin.packageName} behavioral contract`, () => {
				runPluginBehaviorTests({
					name: plugin.packageName,
					factory: spec.factory,
					smokePath:
						(spec.smokePath ?? plugin.testInvoke)
							? plugin.manifest.testInvoke
								? "/"
								: undefined
							: undefined,
					scoped: plugin.manifest.scoped,
					testInvoke: plugin.testInvoke,
					cases: spec.cases,
				});
			});
		}
	}
});
