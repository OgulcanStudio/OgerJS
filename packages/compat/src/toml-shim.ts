/** Minimal TOML parser for Bun.TOML.parse compat (tables, key=value, strings, numbers, booleans). */
export function parse(source: string): Record<string, unknown> {
	const root: Record<string, unknown> = {};
	let current: Record<string, unknown> = root;
	const lines = source.split(/\r?\n/);

	for (let raw of lines) {
		const hash = raw.indexOf("#");
		if (hash >= 0) raw = raw.substring(0, hash);
		const line = raw.trim();
		if (!line) continue;

		const tableMatch = line.match(/^\[([^\]]+)\]$/);
		if (tableMatch) {
			const keys = tableMatch[1]!.split(".").map((k) => k.trim());
			let target: Record<string, unknown> = root;
			for (const key of keys) {
				if (!(key in target) || typeof target[key] !== "object" || target[key] === null) {
					target[key] = {};
				}
				target = target[key] as Record<string, unknown>;
			}
			current = target;
			continue;
		}

		const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
		if (!kv) continue;
		current[kv[1]!] = parseTomlValue(kv[2]!.trim());
	}
	return root;
}

function parseTomlValue(raw: string): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+$/.test(raw)) return Number(raw);
	if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
	if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
		return raw.slice(1, -1);
	}
	if (raw.startsWith("[") && raw.endsWith("]")) {
		const inner = raw.slice(1, -1).trim();
		if (!inner) return [];
		return inner.split(",").map((v) => parseTomlValue(v.trim()));
	}
	return raw;
}

export const TOML = { parse };