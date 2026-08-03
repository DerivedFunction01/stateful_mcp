import type { SchemaField } from "./schema-types";
import { SchemaRegistry } from "./schema-registry";

export interface SchemaPathValidationResult {
	valid: boolean;
	schema: string;
	path: string;
	field?: SchemaField;
	code?: "schema_not_found" | "path_not_found";
	message?: string;
}

export function normalizeSchemaPath(path: string): string {
	return path
		.trim()
		.replace(/\[\d+\]/g, "[]")
		.replace(/\[\s*\]/g, "[]");
}

export function validateTargetPath(
	registry: SchemaRegistry,
	schema: string,
	path: string,
	version?: number,
): SchemaPathValidationResult {
	const normalizedPath = normalizeSchemaPath(path);
	if (!registry.get(schema, version)) {
		return {
			valid: false,
			schema,
			path: normalizedPath,
			code: "schema_not_found",
			message: `Schema '${schema}' is not registered or published`,
		};
	}
	const field = registry.getField(schema, normalizedPath, version);
	if (!field) {
		return {
			valid: false,
			schema,
			path: normalizedPath,
			code: "path_not_found",
			message: `Target path '${path}' is not defined on schema '${schema}'`,
		};
	}
	return { valid: true, schema, path: normalizedPath, field };
}
