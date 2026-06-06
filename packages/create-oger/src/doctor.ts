#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DoctorIssue {
	level: "warn" | "error";
	code: string;
	message: string;
}

export async function runOgerDoctor(
	cwd = process.cwd(),
): Promise<DoctorIssue[]> {
	const issues: DoctorIssue[] = [];
	const pkgPath = join(cwd, "package.json");
	let pkg: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	try {
		pkg = JSON.parse(await readFile(pkgPath, "utf8"));
	} catch {
		issues.push({
			level: "error",
			code: "no-package-json",
			message: "Missing package.json",
		});
		return issues;
	}

	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const ogerDeps = Object.entries(deps ?? {}).filter(([k]) =>
		k.startsWith("@ogerjs/"),
	);
	const versions = new Map<string, string>();
	for (const [name, range] of ogerDeps) {
		if (versions.has(range) === false) versions.set(range, name);
		else if (versions.get(range) !== name) {
			issues.push({
				level: "warn",
				code: "version-skew",
				message: `@ogerjs packages use mixed ranges: ${range}`,
			});
		}
	}

	if (!deps["@ogerjs/core"]) {
		issues.push({
			level: "warn",
			code: "missing-core",
			message: "Add @ogerjs/core dependency",
		});
	}

	if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
		issues.push({
			level: "warn",
			code: "missing-secrets",
			message: "JWT_SECRET unset in production",
		});
	}

	if (!deps.typescript && !deps["@types/bun"]) {
		issues.push({
			level: "warn",
			code: "missing-types",
			message: "Install typescript or @types/bun for typecheck in CI",
		});
	}

	return issues;
}

async function main() {
	const issues = await runOgerDoctor();
	for (const i of issues) {
		console.log(`[${i.level}] ${i.code}: ${i.message}`);
	}
	if (issues.some((i) => i.level === "error")) process.exit(1);
}

import { fileURLToPath } from "node:url";

const isMain =
	typeof process !== "undefined" &&
	process.argv[1] &&
	(process.argv[1].endsWith("doctor.ts") ||
		process.argv[1].endsWith("doctor.js") ||
		process.argv[1].endsWith("oger-doctor"));

if (isMain) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
