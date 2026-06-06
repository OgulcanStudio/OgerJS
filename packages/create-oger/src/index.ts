#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const yes = args.includes("--yes") || args.includes("-y");
const name = args.find((a) => !a.startsWith("-")) ?? "oger-app";
const target = join(process.cwd(), name);

const pkg = {
	name,
	version: "0.1.0",
	type: "module",
	scripts: {
		dev: "bun --watch src/index.ts",
		start: "bun src/index.ts",
	},
	dependencies: {
		"@ogerjs/core": "^0.1.0",
	},
};

const indexTs = `import { Oger, t } from "@ogerjs/core";

const app = new Oger()
\t.get("/", () => ({ ok: true }))
\t.get("/health", () => "ok")
\t.post(
\t\t"/echo",
\t\t({ body }) => body,
\t\t{ body: t.Object({ message: t.String() }) },
\t)
\t.listen(Number(process.env.PORT ?? 3000));

console.log(\`OgerJS listening on http://localhost:\${app.port ?? 3000}\`);
`;

async function main() {
	if (!yes) {
		console.log(`Creating OgerJS app in ./${name} (--yes to skip prompts)`);
	}
	await mkdir(target, { recursive: true });
	await mkdir(join(target, "src"), { recursive: true });
	await writeFile(join(target, "package.json"), JSON.stringify(pkg, null, 2));
	await writeFile(join(target, "src", "index.ts"), indexTs);
	await writeFile(
		join(target, "README.md"),
		`# ${name}\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n`,
	);
	console.log(`Created ${target}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
