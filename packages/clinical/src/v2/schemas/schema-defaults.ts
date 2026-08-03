import type { TypedValue } from "../values/typed-value";
import type { SchemaField } from "./schema-types";
import { SchemaRegistry } from "./schema-registry";
import { normalizeSchemaPath, validateTargetPath } from "./schema-path-validator";

export interface SchemaDefault {
	path: string;
	value: TypedValue;
}

export interface SchemaDefaults {
	schema: string;
	version?: number;
	values: readonly SchemaDefault[];
}

export interface SchemaDefaultDiagnostic {
	path: string;
	message: string;
}

export function validateSchemaDefaults(
	registry: SchemaRegistry,
	defaults: SchemaDefaults,
): SchemaDefaultDiagnostic[] {
	const diagnostics: SchemaDefaultDiagnostic[] = [];
	for (const entry of defaults.values) {
		const path = normalizeSchemaPath(entry.path);
		const result = validateTargetPath(registry, defaults.schema, path, defaults.version);
		if (!result.valid || !result.field) {
			diagnostics.push({ path, message: result.message ?? "Invalid schema default path" });
			continue;
		}
		if (!isCompatibleDefault(result.field, entry.value)) {
			diagnostics.push({
				path,
				message: `Default value kind '${entry.value.kind}' is incompatible with '${result.field.valueKind}'`,
			});
		}
	}
	return diagnostics;
}

function isCompatibleDefault(field: SchemaField, value: TypedValue): boolean {
	if (field.valueKind !== value.kind) return false;
	if (field.cardinality === "many" && value.kind !== "array" && value.kind !== "concept_array") return false;
	if (field.valueKind === "scalar" && value.kind === "scalar") return field.scalarType === value.scalarType;
	if (field.valueKind === "temporal" && value.kind === "temporal") return field.temporalType === value.temporalType;
	return true;
}
