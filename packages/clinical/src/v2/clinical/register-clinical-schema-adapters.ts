import type { SchemaRegistry } from "../schemas/schema-registry";
import { ClinicalSchemaAdapterRegistry } from "./clinical-schema-adapter";

export function registerClinicalSchemaAdapters(
	schemas: SchemaRegistry,
	adapters = new ClinicalSchemaAdapterRegistry(),
): ClinicalSchemaAdapterRegistry {
	for (const schema of schemas.list()) {
		if (adapters.has(schema.schema, schema.version)) continue;
		adapters.register({
			schemaName: schema.schema,
			schemaVersion: schema.version,
			mergePolicy: "record",
			validateRecord: (values) => ({
				valid: Object.keys(values).length > 0,
				diagnostics: Object.keys(values).length > 0 ? [] : [`Schema '${schema.schema}' record cannot be empty`],
			}),
			normalizeRecord: (values) => structuredClone(values),
		});
	}
	return adapters;
}
