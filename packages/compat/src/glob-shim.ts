import fs from "node:fs";
import path from "node:path";

function globToRegExp(pattern: string): RegExp {
	const normalized = pattern.replace(/\\/g, "/");
	const parts = normalized.split("/").filter((p) => p.length > 0);
	let regex = "^";
	for (let pi = 0; pi < parts.length; pi++) {
		const part = parts[pi]!;
		if (pi > 0 || normalized.startsWith("/")) regex += "/";
		if (part === "**") {
			regex += ".*";
			continue;
		}
		for (let i = 0; i < part.length; i++) {
			const ch = part[i];
			if (ch === "*") {
				regex += "[^/]*";
			} else if (ch === "?") {
				regex += "[^/]";
			} else if (ch === "{" && part.indexOf("}", i) > i) {
				const end = part.indexOf("}", i);
				const alts = part.substring(i + 1, end).split(",");
				regex += `(?:${alts.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
				i = end;
			} else {
				regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			}
		}
	}
	regex += "$";
	return new RegExp(regex);
}

export class Glob {
	readonly pattern: string;
	private regex: RegExp;

	constructor(pattern: string) {
		this.pattern = pattern;
		this.regex = globToRegExp(pattern.replace(/\\/g, "/"));
	}

	match(candidate: string): boolean {
		return this.regex.test(candidate.replace(/\\/g, "/"));
	}

	*scan(root = "."): Generator<string> {
		const absRoot = path.resolve(root);
		const self = this;
		function* walk(dir: string): Generator<string> {
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const full = path.join(dir, entry.name);
				const rel = path.relative(absRoot, full).replace(/\\/g, "/");
				const candidate = rel.startsWith("..") ? full.replace(/\\/g, "/") : rel;
				if (self.match(candidate) || self.match(`/${candidate}`) || self.match(full.replace(/\\/g, "/"))) {
					yield full;
				}
				if (entry.isDirectory()) yield* walk(full);
			}
		}
		yield* walk(absRoot);
	}
}