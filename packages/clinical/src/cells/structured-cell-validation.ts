import type { StructuredCell } from "./structured-cell";

export function isStructuredCellRecord(
	value: unknown,
): value is StructuredCell {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	const source = record.source as Record<string, unknown> | undefined;
	const authored = record.authored as Record<string, unknown> | undefined;
	const lifecycle = record.lifecycle as Record<string, unknown> | undefined;
	const collection = record.collection as Record<string, unknown> | undefined;
	return (
		typeof record.cellId === "string" &&
		typeof record.sessionId === "string" &&
		collection != null &&
		typeof source?.origin === "string" &&
		typeof authored?.rawText === "string" &&
		typeof lifecycle?.status === "string" &&
		typeof lifecycle.revision === "number"
	);
}

export interface CellLoadDiagnostic {
	kind: "invalid_record";
	cellId: string | null;
	reason: string;
}

export interface CellLoadResult {
	cells: StructuredCell[];
	diagnostics: CellLoadDiagnostic[];
}
