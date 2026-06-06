export interface SerializeOptions {
	/** Replace `undefined` with `null` in objects. Default false. */
	nullifyUndefined?: boolean;
	/** Custom per-type serializers keyed by constructor name. */
	serializers?: Record<string, (value: unknown) => unknown>;
	/** When true, strip keys matching sensitive patterns. Default false. */
	redact?: boolean;
	/** Extra field names to redact when `redact` is true. */
	sensitiveKeys?: string[];
}

const DEFAULT_SENSITIVE =
	/password|token|secret|api[_-]?key|authorization|cookie/i;

function defaultReplacer(
	options: SerializeOptions,
): (key: string, value: unknown) => unknown {
	const sensitive = new Set(
		(options.sensitiveKeys ?? []).map((k) => k.toLowerCase()),
	);
	return (key, value) => {
		if (options.redact && key) {
			const lower = key.toLowerCase();
			if (sensitive.has(lower) || DEFAULT_SENSITIVE.test(key))
				return "[REDACTED]";
		}
		if (typeof value === "bigint") return value.toString();
		if (value instanceof Date) return value.toISOString();
		if (value === undefined && options.nullifyUndefined) return null;
		const custom = options.serializers?.[value?.constructor?.name ?? ""];
		if (custom) return custom(value);
		return value;
	};
}

/** Fast JSON stringify (no redaction). */
export function fastStringify(value: unknown): string {
	return JSON.stringify(value);
}

/** JSON stringify with BigInt, Date, and optional redaction support. */
export function safeStringify(
	value: unknown,
	options: SerializeOptions = {},
): string {
	return JSON.stringify(value, defaultReplacer(options));
}

/** Parse JSON safely; returns `undefined` on empty or invalid input. */
export function safeParse(text: string): unknown {
	if (!text.trim()) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
