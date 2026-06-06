import { describe, expect, test } from "bun:test";
import {
	definePlugin,
	definePluginWithOptionalOptions,
	definePluginWithOptions,
	defineScopedPlugin,
	defineScopedPluginWithOptionalOptions,
} from "../src/define-plugin";
import { Oger } from "../src/oger";

describe("definePlugin", () => {
	test("returns Oger instance with metadata name", () => {
		const factory = definePlugin({ name: "@ogerjs/test" }, (app) =>
			app.get("/x", () => "ok"),
		);
		const plugin = factory();
		const app = new Oger().use(plugin);
		return app.handle(new Request("http://localhost/x")).then(async (res) => {
			expect(await res.text()).toBe("ok");
		});
	});
});

describe("definePluginWithOptions", () => {
	test("passes options and seed", () => {
		const factory = definePluginWithOptions(
			{ name: "@ogerjs/test-opt" },
			(app, opts) => app.get("/seed", () => opts.label),
			(opts) => opts.label,
		);
		const plugin = factory({ label: "abc" });
		expect(plugin).toBeInstanceOf(Oger);
	});
});

describe("definePluginWithOptionalOptions", () => {
	test("merges defaults", async () => {
		const factory = definePluginWithOptionalOptions(
			{ name: "@ogerjs/test-defaults" },
			(app, opts) => app.get("/", () => opts.msg),
			{ msg: "default" },
		);
		const app = new Oger().use(factory());
		const res = await app.handle(new Request("http://localhost/"));
		expect(await res.text()).toBe("default");
	});
});

describe("defineScopedPlugin", () => {
	test("required options factory", () => {
		const factory = defineScopedPlugin(
			{ name: "@ogerjs/test-scoped-req" },
			(parent, opts) => {
				const count = parent.routes.length;
				return new Oger({ name: "@ogerjs/test-scoped-req" }).get(
					"/tag",
					() => `${count}:${opts.tag}`,
				);
			},
		);
		const parent = new Oger().get("/a", () => "a");
		parent.use(factory({ tag: "x" })(parent));
		return parent
			.handle(new Request("http://localhost/tag"))
			.then(async (res) => {
				expect(await res.text()).toBe("1:x");
			});
	});
});

describe("defineScopedPluginWithOptionalOptions", () => {
	test("reads parent routes", async () => {
		const scoped = defineScopedPluginWithOptionalOptions(
			{ name: "@ogerjs/test-scoped" },
			(parent) => {
				const routeCountAtApply = parent.routes.length;
				return new Oger({ name: "@ogerjs/test-scoped" }).get(
					"/child",
					() => routeCountAtApply,
				);
			},
			{},
		);
		const parent = new Oger().get("/a", () => "a");
		parent.use(scoped()(parent));
		const res = await parent.handle(new Request("http://localhost/child"));
		expect(await res.text()).toBe("1");
	});
});
