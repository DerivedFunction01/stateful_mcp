import type { ParsedItem } from "../../../parser/schema-parsers.v2";

export interface ParsedCellRecordTransform {
	targetSchema: string;
	flatten(parsedItem: ParsedItem): Record<string, any>;
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
