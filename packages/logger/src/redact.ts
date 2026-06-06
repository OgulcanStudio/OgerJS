const DEFAULT_PATTERNS = [
	/password/i,
	/token/i,
	/secret/i,
	/api[_-]?key/i,
	/authorization/i,
	/cookie/i,
	/bearer/i,
	/session/i,
	/credit[_-]?card/i,
];

export interface RedactOptions {
	/** Extra field name patterns (case-insensitive substring match). */
	keys?: string[];
	/** Replacement string. Default `[REDACTED]`. */
	replacement?: string;
	/** Max depth for nested objects. Default 12. */
	maxDepth?: number;
}

function isSensitiveKey(key: string, patterns: RegExp[]): boolean {
	return patterns.some((p) => p.test(key));
}

/** Deep-clone and redact sensitive fields from log payloads. */
export function redact<T>(value: T, options: RedactOptions = {}): T {
	const replacement = options.replacement ?? "[REDACTED]";
	const maxDepth = options.maxDepth ?? 12;
	const extra = (options.keys ?? []).map((k) => new RegExp(k, "i"));
	const patterns = [...DEFAULT_PATTERNS, ...extra];

	function walk(input: unknown, depth: number): unknown {
		if (depth > maxDepth) return input;
		if (input === null || typeof input !== "object") return input;
		if (Array.isArray(input)) return input.map((v) => walk(v, depth + 1));
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
			if (isSensitiveKey(key, patterns)) {
				out[key] = replacement;
			} else {
				out[key] = walk(val, depth + 1);
			}
		}
		return out;
	}

	return walk(value, 0) as T;
}

/** Redact secrets inside a log line string (Bearer tokens, key=value). */
export function redactLogLine(
	line: string,
	options: RedactOptions = {},
): string {
	const replacement = options.replacement ?? "[REDACTED]";
	return line
		.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${replacement}`)
		.replace(
			/(password|token|secret|api[_-]?key)\s*[:=]\s*["']?[^"'\s&]+/gi,
			`$1=${replacement}`,
		);
}
