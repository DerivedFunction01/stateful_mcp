import type { SchemaRegistry } from "../schemas/schema-registry";
import type { RegisteredSchema, SchemaField } from "../schemas/schema-types";
import {
	type ClinicalRecordWriteMode,
	type ClinicalSchemaAdapter,
	ClinicalSchemaAdapterRegistry,
} from "./clinical-schema-adapter";

/**
 * Build a real per-schema adapter from a published schema definition.
 *
 * This replaces the earlier single generic permissive adapter. Each adapter
 * derives its identity field, required paths, cardinality map, and allowed path
 * set from the schema `fields`, so upserts (full record) and patches (partial
 * changes) are validated with real constraint awareness.
 */
export function buildClinicalSchemaAdapter(
	schema: RegisteredSchema,
): ClinicalSchemaAdapter {
	const fields = schema.fields;
	const pathSet = new Set(Object.keys(fields));
	const requiredPaths = Object.values(fields)
		.filter((field) => isTopLevel(field.path) && field.required)
		.map((field) => field.path);
	const cardinality = new Map<string, "one" | "many">(
		Object.values(fields).map((field) => [field.path, field.cardinality]),
	);
	const identityField = deriveIdentityField(fields);

	return {
		schemaName: schema.schema,
		schemaVersion: schema.version,
		identityField,
		mergePolicy: "record",
		validateRecord(values, mode: ClinicalRecordWriteMode = "upsert") {
			return validateValues(
				{ pathSet, requiredPaths, cardinality },
				values,
				mode,
			);
		},
		normalizeRecord: (values) => structuredClone(values),
	};
}

interface ValidationShape {
	pathSet: Set<string>;
	requiredPaths: string[];
	cardinality: Map<string, "one" | "many">;
}

function validateValues(
	shape: ValidationShape,
	values: Record<string, unknown>,
	mode: ClinicalRecordWriteMode,
): { valid: boolean; diagnostics: string[] } {
	const diagnostics: string[] = [];
	for (const key of Object.keys(values)) {
		if (!shape.pathSet.has(key)) {
			diagnostics.push(`Path '${key}' is not defined on the schema`);
		} else {
			const card = shape.cardinality.get(key);
			const value = values[key];
			if (card === "many" && value === undefined) {
				diagnostics.push(`Path '${key}' requires a value`);
			} else if (card === "many" && !Array.isArray(value)) {
				diagnostics.push(
					`Path '${key}' is many-cardinality and must be an array`,
				);
			}
		}
	}
	if (mode === "upsert") {
		for (const required of shape.requiredPaths) {
			if (values[required] === undefined || values[required] === null)
				diagnostics.push(`Required field '${required}' is missing on upsert`);
		}
	}
	return { valid: diagnostics.length === 0, diagnostics };
}

function deriveIdentityField(
	fields: Readonly<Record<string, SchemaField>>,
): string | undefined {
	const id = Object.values(fields).find(
		(field) =>
			field.path === "id" ||
			(field.required &&
				field.valueKind === "scalar" &&
				isTopLevel(field.path)),
	);
	return id?.path;
}

function isTopLevel(path: string): boolean {
	return !path.includes(".") && !path.includes("[");
}

export function registerClinicalSchemaAdapters(
	schemas: SchemaRegistry,
	adapters = new ClinicalSchemaAdapterRegistry(),
): ClinicalSchemaAdapterRegistry {
	for (const schema of schemas.list()) {
		if (adapters.has(schema.schema, schema.version)) continue;
		adapters.register(buildClinicalSchemaAdapter(schema));
	}
	return adapters;
}
