import type { ParsedItem } from "../../../parser/schema-parsers";

export type TransformSqlType = "text" | "int" | "real" | "bool" | "json";

export interface TransformColumnSpec {
	path: string;
	sqlType: TransformSqlType;
	primaryKey?: boolean;
	nullable?: boolean;
	default?: string | number | boolean | null;
}

export interface TransformIndexSpec {
	columns: string[];
	unique?: boolean;
}

export interface ParsedCellRecordTransform {
	targetSchema: string;
	flatten(parsedItem: ParsedItem): Record<string, any>;
	template(): ParsedItem;
	indexes?: TransformIndexSpec[];
}

function inferSqlType(value: unknown): TransformSqlType {
	if (typeof value === "number") {
		return Number.isInteger(value) ? "int" : "real";
	}
	if (typeof value === "boolean") {
		return "bool";
	}
	if (typeof value === "string") {
		return "text";
	}
	if (Array.isArray(value)) {
		return "json";
	}
	if (value !== null && typeof value === "object") {
		return "json";
	}
	return "text";
}

export function buildColumnSpecs(
	transform: ParsedCellRecordTransform,
): TransformColumnSpec[] {
	const template = transform.template();
	const flatSample = transform.flatten(template);

	return Object.entries(flatSample).map(([path, value]) => ({
		path,
		sqlType: inferSqlType(value),
		nullable: true,
	}));
}

const transformRegistry = new Map<string, ParsedCellRecordTransform>();

export function getTransformForSchema(
	targetSchema: string,
): ParsedCellRecordTransform | undefined {
	return transformRegistry.get(targetSchema);
}

export function registerTransform(transform: ParsedCellRecordTransform): void {
	transformRegistry.set(transform.targetSchema, transform);
}
