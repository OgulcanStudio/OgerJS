import { compileSchema } from "./compile";
import type { SchemaOptions, TSchema } from "./types";

function schema(kind: TSchema["kind"], extra: Partial<TSchema> = {}): TSchema {
	return { kind, ...extra } as TSchema;
}

export const t = {
	String(opts?: SchemaOptions): TSchema {
		return schema("string", { options: opts });
	},
	Number(opts?: SchemaOptions): TSchema {
		return schema("number", { options: opts });
	},
	Integer(opts?: SchemaOptions): TSchema {
		return schema("integer", { options: opts });
	},
	Boolean(): TSchema {
		return schema("boolean");
	},
	Literal<T extends string | number | boolean>(value: T): TSchema {
		return schema("literal", { literal: value });
	},
	Enum<T extends readonly [string, ...string[]]>(values: T): TSchema {
		return schema("enum", { literals: values });
	},
	Object<P extends Record<string, TSchema>>(
		properties: P,
		opts?: { required?: string[]; additionalProperties?: boolean },
	): TSchema {
		const required =
			opts?.required ??
			Object.keys(properties).filter((k) => properties[k]?.kind !== "optional");
		return schema("object", {
			properties,
			required,
			additionalProperties: opts?.additionalProperties,
		});
	},
	Array(items: TSchema): TSchema {
		return schema("array", { items });
	},
	Tuple(elements: TSchema[]): TSchema {
		return schema("tuple", { elements });
	},
	Union(variants: TSchema[]): TSchema {
		return schema("union", { variants });
	},
	Optional(items: TSchema): TSchema {
		return schema("optional", { items });
	},
	Nullable(items: TSchema): TSchema {
		return schema("nullable", { items });
	},
	Record(values: TSchema): TSchema {
		return schema("record", { values });
	},
	Any(): TSchema {
		return schema("any");
	},
	Unknown(): TSchema {
		return schema("unknown");
	},
	File(): TSchema {
		return schema("file");
	},
	Files(): TSchema {
		return schema("files");
	},
};

export type { Static, TSchema, Validator, ValidatorResult } from "./types";
export { compileSchema };

export function compile<T extends TSchema>(s: T) {
	return compileSchema(s);
}
