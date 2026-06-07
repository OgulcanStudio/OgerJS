function parseVersion(v: string) {
	const match = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/);
	if (!match) throw new Error(`Invalid semver version: ${v}`);
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		prerelease: match[4] || null,
	};
}

function compareVersions(v1Str: string, v2Str: string): number {
	const v1 = parseVersion(v1Str);
	const v2 = parseVersion(v2Str);

	if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
	if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
	if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;

	if (v1.prerelease !== v2.prerelease) {
		if (!v1.prerelease) return 1;
		if (!v2.prerelease) return -1;
		
		const parts1 = v1.prerelease.split(".");
		const parts2 = v2.prerelease.split(".");
		const len = Math.max(parts1.length, parts2.length);
		for (let i = 0; i < len; i++) {
			const p1 = parts1[i];
			const p2 = parts2[i];
			if (p1 === undefined) return -1;
			if (p2 === undefined) return 1;
			
			const isN1 = /^\d+$/.test(p1);
			const isN2 = /^\d+$/.test(p2);
			if (isN1 && isN2) {
				const n1 = parseInt(p1, 10);
				const n2 = parseInt(p2, 10);
				if (n1 !== n2) return n1 > n2 ? 1 : -1;
			} else if (isN1 && !isN2) {
				return -1;
			} else if (!isN1 && isN2) {
				return 1;
			} else {
				if (p1 !== p2) return p1.localeCompare(p2) > 0 ? 1 : -1;
			}
		}
	}
	return 0;
}

export function order(a: string, b: string): number {
	return compareVersions(a, b);
}

function parseRange(r: string): Array<{ op: string; version: string }> {
	const cleaned = r.trim().replace(/\s+/g, " ");
	if (cleaned === "*" || cleaned === "" || cleaned === "x") {
		return [];
	}
	
	const clauses = cleaned.split(" ");
	const result: Array<{ op: string; version: string }> = [];

	for (const clause of clauses) {
		const match = clause.match(/^([>=<~^]+)?v?(\d+(?:\.\d+)?(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)$/);
		if (!match) continue;
		let op = match[1] || "=";
		let vStr = match[2];

		// Normalize partial versions, e.g. "1.2" -> "1.2.0"
		const parts = vStr.split("-")[0].split(".");
		const prerelease = vStr.includes("-") ? "-" + vStr.split("-").slice(1).join("-") : "";
		if (parts.length === 1) {
			vStr = `${parts[0]}.0.0${prerelease}`;
		} else if (parts.length === 2) {
			vStr = `${parts[0]}.${parts[1]}.0${prerelease}`;
		}

		if (op === "^") {
			const parsed = parseVersion(vStr);
			result.push({ op: ">=", version: vStr });
			if (parsed.major > 0) {
				result.push({ op: "<", version: `${parsed.major + 1}.0.0` });
			} else if (parsed.minor > 0) {
				result.push({ op: "<", version: `0.${parsed.minor + 1}.0` });
			} else {
				result.push({ op: "<", version: `0.0.${parsed.patch + 1}` });
			}
		} else if (op === "~") {
			const parsed = parseVersion(vStr);
			result.push({ op: ">=", version: vStr });
			result.push({ op: "<", version: `${parsed.major}.${parsed.minor + 1}.0` });
		} else {
			result.push({ op, version: vStr });
		}
	}
	return result;
}

export function satisfies(version: string, range: string): boolean {
	try {
		const rules = parseRange(range);
		if (rules.length === 0) return true;
		
		for (const rule of rules) {
			const cmp = compareVersions(version, rule.version);
			if (rule.op === "=" || rule.op === "==") {
				if (cmp !== 0) return false;
			} else if (rule.op === ">=") {
				if (cmp < 0) return false;
			} else if (rule.op === "<=") {
				if (cmp > 0) return false;
			} else if (rule.op === ">") {
				if (cmp <= 0) return false;
			} else if (rule.op === "<") {
				if (cmp >= 0) return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}
