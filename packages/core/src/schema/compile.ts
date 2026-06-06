import type { TSchema, Validator, ValidatorResult } from "./types";

function issue(
	type: string,
	property: string,
	message: string,
	expected?: string,
): ValidatorResult["issues"] {
	return [{ type, property, message, expected }];
}

function fail(
	type: string,
	property: string,
	message: string,
	expected?: string,
): ValidatorResult {
	return { success: false, issues: issue(type, property, message, expected) };
}

function ok<T>(value: T): ValidatorResult<T> {
	return { success: true, value };
}

export function compileSchema(schema: TSchema): Validator {
	switch (schema.kind) {
		case "string": {
			const o = schema.options;
			const patternRegExp = o?.pattern ? new RegExp(o.pattern) : null;
			const emailRegExp = o?.format === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/ : null;
			return (input, path = "") => {
				if (typeof input !== "string")
					return fail("string", path, "Expected string", "string");
				if (o?.minLength !== undefined && input.length < o.minLength)
					return fail("string", path, `Min length ${o.minLength}`);
				if (o?.maxLength !== undefined && input.length > o.maxLength)
					return fail("string", path, `Max length ${o.maxLength}`);
				if (patternRegExp && !patternRegExp.test(input))
					return fail("string", path, "Pattern mismatch");
				if (emailRegExp && !emailRegExp.test(input))
					return fail("string", path, "Invalid email");
				return ok(input);
			};
		}
		case "number":
			return (input, path = "") => {
				if (typeof input !== "number" || Number.isNaN(input))
					return fail("number", path, "Expected number", "number");
				const o = schema.options;
				if (o?.min !== undefined && input < o.min)
					return fail("number", path, `Min ${o.min}`);
				if (o?.max !== undefined && input > o.max)
					return fail("number", path, `Max ${o.max}`);
				return ok(input);
			};
		case "integer":
			return (input, path = "") => {
				if (typeof input !== "number" || !Number.isInteger(input))
					return fail("integer", path, "Expected integer", "integer");
				return ok(input);
			};
		case "boolean":
			return (input, path = "") => {
				if (typeof input !== "boolean")
					return fail("boolean", path, "Expected boolean", "boolean");
				return ok(input);
			};
		case "literal":
			return (input, path = "") => {
				if (input !== schema.literal)
					return fail("literal", path, `Expected ${schema.literal}`);
				return ok(input);
			};
		case "enum":
			return (input, path = "") => {
				if (!schema.literals?.includes(input as never))
					return fail(
						"enum",
						path,
						`Expected one of ${schema.literals?.join(", ")}`,
					);
				return ok(input);
			};
		case "any":
		case "unknown":
			return (input) => ok(input);
		case "optional": {
			const inner = schema.items
				? compileSchema(schema.items)
				: (v: unknown) => ok(v);
			return (input, path = "") => {
				if (input === undefined) return ok(undefined);
				return inner(input, path);
			};
		}
		case "nullable": {
			const inner = schema.items
				? compileSchema(schema.items)
				: (v: unknown) => ok(v);
			return (input, path = "") => {
				if (input === null) return ok(null);
				return inner(input, path);
			};
		}
		case "array": {
			const itemValidator = schema.items ? compileSchema(schema.items) : null;
			return (input, path = "") => {
				if (!Array.isArray(input))
					return fail("array", path, "Expected array", "array");
				if (!itemValidator) return ok(input);
				const out: unknown[] = [];
				for (let i = 0; i < input.length; i++) {
					const r = itemValidator(input[i], `${path}/${i}`);
					if (!r.success) return r;
					out.push(r.value);
				}
				return ok(out);
			};
		}
		case "object": {
			const props = schema.properties ?? {};
			const validators: Record<string, Validator> = {};
			for (const [k, v] of Object.entries(props))
				validators[k] = compileSchema(v);
			const required = new Set(
				schema.required ??
					Object.keys(props).filter((k) => props[k]?.kind !== "optional"),
			);
			const stripExtra = schema.additionalProperties === false;
			return (input, path = "") => {
				if (typeof input !== "object" || input === null || Array.isArray(input))
					return fail("object", path, "Expected object", "object");
				const obj = input as Record<string, unknown>;
				const out: Record<string, unknown> = {};
				for (const key of required) {
					if (!(key in obj) && props[key]?.kind !== "optional")
						return fail(
							"object",
							`${path}/${key}`,
							"Required property missing",
						);
				}
				if (stripExtra) {
					for (const key of Object.keys(obj)) {
						if (!(key in props)) {
							return fail(
								"object",
								path ? `${path}/${key}` : key,
								"Unexpected property",
							);
						}
					}
				}
				for (const [key, validator] of Object.entries(validators)) {
					if (!(key in obj)) {
						if (props[key]?.kind === "optional") continue;
						continue;
					}
					const r = validator(obj[key], path ? `${path}/${key}` : key);
					if (!r.success) return r;
					if (r.value !== undefined) out[key] = r.value;
				}
				return ok(stripExtra ? out : { ...obj, ...out });
			};
		}
		case "union": {
			const variants = (schema.variants ?? []).map(compileSchema);
			return (input, path = "") => {
				for (const v of variants) {
					const r = v(input, path);
					if (r.success) return r;
				}
				return fail("union", path, "No variant matched");
			};
		}
		case "record": {
			const valueValidator = schema.values
				? compileSchema(schema.values)
				: null;
			return (input, path = "") => {
				if (typeof input !== "object" || input === null || Array.isArray(input))
					return fail("record", path, "Expected record");
				const out: Record<string, unknown> = {};
				for (const [k, val] of Object.entries(
					input as Record<string, unknown>,
				)) {
					if (!valueValidator) {
						out[k] = val;
						continue;
					}
					const r = valueValidator(val, `${path}/${k}`);
					if (!r.success) return r;
					out[k] = r.value;
				}
				return ok(out);
			};
		}
		case "file":
			return (input, path = "") => {
				if (
					input instanceof File ||
					(input && typeof input === "object" && "name" in input)
				)
					return ok(input);
				return fail("file", path, "Expected file");
			};
		case "files":
			return (input, path = "") => {
				if (Array.isArray(input) && input.every((f) => f instanceof File))
					return ok(input);
				return fail("files", path, "Expected files array");
			};
		case "custom":
			return schema.validate ?? ((input) => ok(input));
		default:
			return (input) => ok(input);
	}
}
