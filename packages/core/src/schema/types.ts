export type SchemaKind =
	| "string"
	| "number"
	| "integer"
	| "boolean"
	| "literal"
	| "enum"
	| "object"
	| "array"
	| "tuple"
	| "union"
	| "optional"
	| "nullable"
	| "record"
	| "any"
	| "unknown"
	| "file"
	| "files"
	| "custom";

export interface SchemaOptions {
	minLength?: number;
	maxLength?: number;
	min?: number;
	max?: number;
	pattern?: string;
	format?: "email" | "uri" | "uuid" | "date-time";
	default?: unknown;
}

export interface TSchema {
	readonly kind: SchemaKind;
	readonly options?: SchemaOptions;
	readonly properties?: Record<string, TSchema>;
	readonly items?: TSchema;
	readonly elements?: TSchema[];
	readonly values?: TSchema;
	readonly variants?: TSchema[];
	readonly literals?: readonly (string | number | boolean)[];
	readonly literal?: string | number | boolean;
	readonly required?: string[];
	readonly additionalProperties?: boolean;
	/** Custom validator when `kind` is `custom`. */
	readonly validate?: Validator;
}

export type Static<T> = T extends TSchema ? InferSchema<T> : never;

type InferSchema<S extends TSchema> = S["kind"] extends "string"
	? string
	: S["kind"] extends "number"
		? number
		: S["kind"] extends "integer"
			? number
			: S["kind"] extends "boolean"
				? boolean
				: S["kind"] extends "literal"
					? S["literal"]
					: S["kind"] extends "enum"
						? S["literals"] extends readonly (infer U)[]
							? U
							: never
						: S["kind"] extends "object"
							? {
									[K in keyof S["properties"] &
										string]: S["properties"][K] extends TSchema
										? S["properties"][K]["kind"] extends "optional"
											? Static<S["properties"][K]> | undefined
											: Static<S["properties"][K]>
										: unknown;
								}
							: S["kind"] extends "array"
								? S["items"] extends TSchema
									? Static<S["items"]>[]
									: unknown[]
								: S["kind"] extends "optional"
									? S["items"] extends TSchema
										? Static<S["items"]> | undefined
										: unknown
									: S["kind"] extends "nullable"
										? S["items"] extends TSchema
											? Static<S["items"]> | null
											: unknown
										: S["kind"] extends "union"
											? S["variants"] extends TSchema[]
												? Static<S["variants"][number]>
												: unknown
											: unknown;

export interface ValidatorResult<T = unknown> {
	success: boolean;
	value?: T;
	issues?: Array<{
		type: string;
		property: string;
		message: string;
		expected?: string;
	}>;
}

export type Validator<T = unknown> = (
	input: unknown,
	path?: string,
) => ValidatorResult<T>;
