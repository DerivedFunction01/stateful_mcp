import type { ColumnDef } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers";

export interface TransformIndexSpec {
	columns: string[];
	unique?: boolean;
}

export interface ParsedCellRecordTransform {
	targetSchema: string;
	flatten(parsedItem: ParsedItem): Record<string, any>;
	template(): ParsedItem;
	indexes?: TransformIndexSpec[];
	columnSpecs?: ColumnDef[];
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
