import { ValidationError } from "./error";
import { compileSchema } from "./schema/compile";
import type { Static, TSchema } from "./schema/types";

export interface LoadEnvOptions {
	/** When true (default), missing keys are read from `process.env`. */
	fromProcessEnv?: boolean;
	/** Prefix stripped from env keys before mapping to schema properties (e.g. `APP_`). */
	prefix?: string;
	/** Property names (or suffixes like `SECRET`, `PASSWORD`) masked in `formatEnvForLog`. */
	secretKeys?: string[];
	/** Default values merged before validation (handler-first config). */
	defaults?: Record<string, unknown>;
}

/** Mask a secret for logs (keeps last `visible` characters). */
export function maskEnvValue(value: string, visible = 4): string {
	if (value.length <= visible) return "*".repeat(value.length);
	return `${"*".repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`;
}

/** Return a log-safe copy of env/config with secrets redacted. */
export function formatEnvForLog<T extends Record<string, unknown>>(
	env: T,
	secretKeys: string[] = ["SECRET", "PASSWORD", "TOKEN", "KEY"],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(env)) {
		const isSecret =
			secretKeys.some((s) => key.toUpperCase().includes(s.toUpperCase())) ||
			secretKeys.includes(key);
		out[key] = isSecret && typeof val === "string" ? maskEnvValue(val) : val;
	}
	return out;
}

function readEnvRecord(prefix?: string): Record<string, string | undefined> {
	const raw = typeof Bun !== "undefined" ? Bun.env : process.env;
	const out: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (prefix && !k.startsWith(prefix)) continue;
		const key = prefix ? k.slice(prefix.length) : k;
		out[key] = v;
	}
	return out;
}

function envToObject(
	schema: TSchema,
	env: Record<string, string | undefined>,
): Record<string, unknown> {
	if (schema.kind !== "object" || !schema.properties) {
		throw new Error("loadEnv: schema must be t.Object({ ... })");
	}
	const input: Record<string, unknown> = {};
	for (const key of Object.keys(schema.properties)) {
		const raw = env[key] ?? env[key.toUpperCase()];
		if (raw !== undefined)
			input[key] = coerceEnvValue(schema.properties[key], raw);
	}
	return input;
}

function coerceEnvValue(field: TSchema, raw: string): unknown {
	switch (field.kind) {
		case "boolean":
			return raw === "1" || raw.toLowerCase() === "true";
		case "number":
		case "integer": {
			const n = Number(raw);
			return Number.isFinite(n) ? n : raw;
		}
		case "array":
			return raw.split(",").map((s) => s.trim());
		default:
			return raw;
	}
}

/** Validate environment variables against an `Oger.t` object schema. */
export function loadEnv<S extends TSchema>(
	schema: S,
	options: LoadEnvOptions = {},
): Static<S> {
	const fromProcessEnv = options.fromProcessEnv ?? true;
	const env = fromProcessEnv ? readEnvRecord(options.prefix) : {};
	const input = { ...options.defaults, ...envToObject(schema, env) };
	const validate = compileSchema(schema);
	const result = validate(input, "env");
	if (!result.success) {
		throw new ValidationError(result.issues ?? []);
	}
	return result.value as Static<S>;
}
