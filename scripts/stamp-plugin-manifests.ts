#!/usr/bin/env bun
/** One-time helper: stamp `ogerjs.plugin` metadata on official plugin package.json files. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	defaultExportName,
	NON_PLUGIN_PACKAGES,
	PLUGIN_SCOPED,
} from "../packages/testing/src/plugin-registry.ts";

const root = join(import.meta.dir, "../packages");

for (const entry of readdirSync(root, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const dirName = entry.name;
	if (NON_PLUGIN_PACKAGES.has(dirName)) continue;
	if (!existsSync(join(root, dirName, "src/index.ts"))) continue;

	const source = readFileSync(join(root, dirName, "src/index.ts"), "utf8");
	if (!/define(?:Scoped)?Plugin/.test(source)) continue;

	const pkgPath = join(root, dirName, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<
		string,
		unknown
	>;
	const ogerjs = (pkg.ogerjs as Record<string, unknown> | undefined) ?? {};

	ogerjs.plugin = true;
	ogerjs.export ??= defaultExportName(dirName);
	if (PLUGIN_SCOPED.has(dirName)) ogerjs.scoped = true;

	pkg.ogerjs = ogerjs;
	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	console.log(`stamped ${pkg.name}`);
}
