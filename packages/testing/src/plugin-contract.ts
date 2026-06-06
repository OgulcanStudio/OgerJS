import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Oger } from "@ogerjs/core";
import {
	type DiscoveredPlugin,
	defaultExportName,
	isPluginPackage,
	type OgerjsPluginManifest,
	PLUGIN_SCOPED,
	resolveTestInvoke,
} from "./plugin-registry";

const PACKAGES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function discoverPlugins(root = PACKAGES_ROOT): DiscoveredPlugin[] {
	const entries = readdirSync(root, { withFileTypes: true });
	const plugins: DiscoveredPlugin[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dirName = entry.name;
		const pkgPath = join(root, dirName, "package.json");
		if (!existsSync(pkgPath)) continue;

		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
			name?: string;
			ogerjs?: OgerjsPluginManifest;
		};
		if (!pkg.name?.startsWith("@ogerjs/")) continue;
		if (!isPluginPackage(dirName, pkg)) continue;

		const manifest = pkg.ogerjs ?? { plugin: true };
		const exportName = manifest.export ?? defaultExportName(dirName);
		plugins.push({
			dirName,
			packageName: pkg.name,
			manifest: {
				...manifest,
				scoped: manifest.scoped ?? PLUGIN_SCOPED.has(dirName),
			},
			exportName,
			testInvoke: resolveTestInvoke(pkg.name, manifest),
		});
	}

	return plugins.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

type PluginFactory = ((...args: never[]) => unknown) & { length: number };

export function instantiatePlugin(
	factory: PluginFactory,
	options: { scoped?: boolean; testInvoke?: unknown },
): unknown {
	const { scoped, testInvoke } = options;

	if (testInvoke !== undefined) {
		const instance = factory(testInvoke as never);
		if (scoped) {
			const parent = new Oger();
			return typeof instance === "function" ? instance(parent) : instance;
		}
		return instance;
	}

	if (factory.length === 0) {
		const instance = factory();
		if (scoped && typeof instance === "function") {
			return instance(new Oger());
		}
		return instance;
	}

	const instance = factory(undefined as never);
	if (scoped && typeof instance === "function") {
		return instance(new Oger());
	}
	return instance;
}

export interface PluginTestCase {
	name: string;
	options?: any;
	setup?: (app: Oger) => void | Promise<void>;
	setupAfter?: (app: Oger) => void | Promise<void>;
	request?: {
		path?: string;
		method?: string;
		headers?: Record<string, string>;
		body?: any;
	};
	expect?: {
		status?: number;
		body?: any;
		headers?: Record<string, any>;
	};
	assert?: (res: Response, app: Oger) => void | Promise<void>;
}

export interface PluginBehaviorTestOptions {
	name: string;
	factory: PluginFactory;
	smokePath?: string;
	scoped?: boolean;
	testInvoke?: unknown;
	cases?: PluginTestCase[];
}

/** Shared behavior smoke tests for a single plugin factory (use in plugin `test/*.test.ts`). */
export function runPluginBehaviorTests(
	options: PluginBehaviorTestOptions,
): void {
	const { name, factory, smokePath, scoped, testInvoke, cases } = options;

	test("factory returns an Oger plugin instance", () => {
		const instance = instantiatePlugin(factory, { scoped, testInvoke });
		expect(instance).toBeInstanceOf(Oger);
	});

	test("mounts on a parent Oger app", () => {
		const plugin = instantiatePlugin(factory, { scoped, testInvoke });
		const parent = new Oger();
		expect(() => parent.use(plugin as Oger)).not.toThrow();
	});

	if (smokePath) {
		test(`smoke GET ${smokePath}`, async () => {
			const plugin = instantiatePlugin(factory, { scoped, testInvoke });
			const app = new Oger().use(plugin as Oger);
			const res = await app.inject(smokePath);
			expect(res.status).toBeLessThan(500);
		});
	}

	if (cases) {
		for (const c of cases) {
			test(c.name, async () => {
				const plugin = instantiatePlugin(factory, {
					scoped: false,
					testInvoke: c.options ?? testInvoke,
				});
				const app = new Oger();
				if (c.setup) {
					await c.setup(app);
				}
				app.use(plugin as Oger);
				if (c.setupAfter) {
					await c.setupAfter(app);
				}

				if (c.request) {
					const method = c.request.method ?? "GET";
					const path = c.request.path ?? "/";
					const url = `http://localhost${path}`;
					const req = new Request(url, {
						method,
						headers: c.request.headers,
						body: c.request.body
							? typeof c.request.body === "object"
								? JSON.stringify(c.request.body)
								: c.request.body
							: undefined,
					});

					const res = await app.handle(req);

					if (c.expect) {
						if (c.expect.status !== undefined) {
							expect(res.status).toBe(c.expect.status);
						}

						if (c.expect.body !== undefined) {
							const text = await res.text();
							let parsed = text;
							try {
								parsed = JSON.parse(text);
							} catch {}

							if (typeof c.expect.body === "function") {
								c.expect.body(parsed);
							} else if (c.expect.body instanceof RegExp) {
								expect(text).toMatch(c.expect.body);
							} else if (
								typeof c.expect.body === "object" &&
								c.expect.body !== null
							) {
								expect(parsed).toEqual(c.expect.body);
							} else {
								expect(text).toBe(c.expect.body);
							}
						}

						if (c.expect.headers !== undefined) {
							for (const [key, val] of Object.entries(c.expect.headers)) {
								const actual = res.headers.get(key);
								if (typeof val === "function") {
									val(actual);
								} else if (val instanceof RegExp) {
									expect(actual ?? "").toMatch(val);
								} else if (val === null) {
									expect(actual).toBeNull();
								} else {
									if (typeof val === "string") {
										expect(actual).toBe(val);
									} else {
										expect(actual).toContain(String(val));
									}
								}
							}
						}
					}

					if (c.assert) {
						await c.assert(res, app);
					}
				}
			});
		}
	}
}

export async function loadPluginModule(
	dirName: string,
): Promise<Record<string, unknown>> {
	const indexPath = join(PACKAGES_ROOT, dirName, "src/index.ts");
	return import(pathToFileURL(indexPath).href);
}

export function assertPluginPackageLayout(dirName: string): void {
	const base = join(PACKAGES_ROOT, dirName);
	expect(existsSync(join(base, "package.json"))).toBe(true);
	expect(existsSync(join(base, "src/index.ts"))).toBe(true);
	expect(existsSync(join(base, "tsconfig.json"))).toBe(true);

	const pkg = JSON.parse(readFileSync(join(base, "package.json"), "utf8")) as {
		scripts?: Record<string, string>;
		dependencies?: Record<string, string>;
	};
	expect(pkg.scripts?.test).toBe("bun test");
	expect(pkg.scripts?.typecheck).toContain("tsc");
	expect(pkg.dependencies?.["@ogerjs/core"]).toBe("workspace:*");
}

/** Contract suite entry — import in `plugins-contract.test.ts`. */
export function definePluginContractSuite(plugins: DiscoveredPlugin[]): void {
	describe("plugin package layout", () => {
		for (const plugin of plugins) {
			test(`${plugin.packageName} matches template layout`, () => {
				assertPluginPackageLayout(plugin.dirName);
			});
		}
	});

	describe("plugin factory contract", () => {
		for (const plugin of plugins) {
			test(`${plugin.packageName} export mounts as Oger`, async () => {
				const mod = await loadPluginModule(plugin.dirName);
				const factory = mod[plugin.exportName];
				expect(typeof factory).toBe("function");

				const instance = instantiatePlugin(factory as PluginFactory, {
					scoped: plugin.manifest.scoped,
					testInvoke: plugin.testInvoke,
				});
				expect(instance).toBeInstanceOf(Oger);

				const parent = new Oger();
				parent.use(instance as Oger);
			});
		}
	});
}
