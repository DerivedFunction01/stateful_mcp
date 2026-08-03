import type { SchemaDefinition, SchemaField } from "./schema-types";

export interface SchemaFieldDefinition extends SchemaField {
	path: string;
}

export function defineSchema(
	definition: Omit<SchemaDefinition, "fields"> & {
		fields: Readonly<Record<string, SchemaFieldDefinition>>;
	},
): SchemaDefinition {
	const fields = Object.fromEntries(
		Object.entries(definition.fields).map(([key, field]) => {
			if (key !== field.path) {
				throw new Error(
					`Schema field key '${key}' must match its path '${field.path}'`,
				);
			}
			return [key, { ...field }];
		}),
	) as Record<string, SchemaField>;

	return { ...definition, fields };
}
