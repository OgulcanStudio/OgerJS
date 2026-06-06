import type { TSchema, Validator, ValidatorResult } from "./types";

/** Standard Schema v1 compatible surface (subset). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (value: unknown) => StandardSchemaResult<Output>;
	};
}

export interface StandardSchemaResult<Output> {
	readonly value?: Output;
	readonly issues?: readonly {
		message: string;
		path?: readonly PropertyKey[];
	}[];
}

function pathToString(path: readonly PropertyKey[] | undefined): string {
	if (!path?.length) return "";
	return path.map(String).join("/");
}

/** Wrap any `Validator` as an Oger `TSchema` for route macros. */
export function adaptValidator(validate: Validator, label = "custom"): TSchema {
	return { kind: "custom", validate, literal: label } as TSchema;
}

/** Bridge a Standard Schema v1 implementation into Oger validators. */
export function fromStandardSchema<S extends StandardSchemaV1>(
	schema: S,
): TSchema {
	const validate: Validator = (input, path = "") => {
		const result = schema["~standard"].validate(input);
		if (result.issues?.length) {
			const issues: ValidatorResult["issues"] = result.issues.map((issue) => ({
				type: "standard",
				property: path
					? `${path}/${pathToString(issue.path)}`
					: pathToString(issue.path),
				message: issue.message,
			}));
			return { success: false, issues };
		}
		return { success: true, value: result.value ?? input };
	};
	return adaptValidator(validate, schema["~standard"].vendor);
}

/** Minimal TypeBox-style object adapter (no external deps). */
export function fromTypeBoxLike(
	schema: {
		type?: string;
		properties?: Record<string, { type?: string; minLength?: number }>;
		required?: string[];
	},
	label = "typebox",
): TSchema {
	const validate: Validator = (input, path = "") => {
		if (typeof input !== "object" || input === null || Array.isArray(input)) {
			return {
				success: false,
				issues: [
					{ type: "object", property: path, message: "Expected object" },
				],
			};
		}
		const obj = input as Record<string, unknown>;
		const required = new Set(
			schema.required ?? Object.keys(schema.properties ?? {}),
		);
		for (const key of required) {
			if (!(key in obj)) {
				return {
					success: false,
					issues: [
						{ type: "object", property: `${path}/${key}`, message: "Required" },
					],
				};
			}
		}
		for (const [key, prop] of Object.entries(schema.properties ?? {})) {
			const val = obj[key];
			if (val === undefined) continue;
			if (prop.type === "string" && typeof val !== "string") {
				return {
					success: false,
					issues: [
						{
							type: "string",
							property: `${path}/${key}`,
							message: "Expected string",
						},
					],
				};
			}
			if (prop.type === "number" && typeof val !== "number") {
				return {
					success: false,
					issues: [
						{
							type: "number",
							property: `${path}/${key}`,
							message: "Expected number",
						},
					],
				};
			}
		}
		return { success: true, value: input };
	};
	return adaptValidator(validate, label);
}
