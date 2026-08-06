import type { CreateCellRequest } from "./cell-service-types";
import type { StructuredCell } from "./structured-cell";

function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID()}`;
}

export function createCell(
	request: CreateCellRequest,
	now = new Date().toISOString(),
): StructuredCell {
	return {
		cellId: newId("cell"),
		sessionId: request.sessionId,
		collection: request.collection,
		source: {
			origin: "user",
			authorId: request.authorId,
			createdAt: now,
			updatedAt: now,
		},
		authored: {
			rawText: request.rawText,
			finalizedMacro: request.finalizedMacro,
		},
		lifecycle: {
			status: request.finalizedMacro ? "pending_commit" : "draft",
			revision: 1,
		},
		execution: request.finalizedMacro
			? { planFingerprint: request.finalizedMacro.fingerprint }
			: {},
		provenance: {},
		relationships: {},
		diagnostics: [],
	};
}

export function editCell(
	cell: StructuredCell,
	rawText: string,
	expectedRevision: number,
	now = new Date().toISOString(),
): StructuredCell {
	if (cell.lifecycle.revision !== expectedRevision) {
		throw new Error(`Cell '${cell.cellId}' revision mismatch`);
	}
	if (cell.lifecycle.status === "committed") {
		throw new Error(`Cell '${cell.cellId}' is immutable`);
	}
	return {
		...cell,
		authored: { ...cell.authored, rawText },
		lifecycle: {
			...cell.lifecycle,
			revision: cell.lifecycle.revision + 1,
			status: "draft",
		},
		source: { ...cell.source, updatedAt: now },
		execution: {},
		diagnostics: [],
	};
}

export function supersedeCell(
	cell: StructuredCell,
	newRawText: string,
	expectedRevision: number,
	authorId?: string,
	now = new Date().toISOString(),
): StructuredCell {
	if (cell.lifecycle.revision !== expectedRevision) {
		throw new Error(`Cell '${cell.cellId}' revision mismatch`);
	}
	return {
		cellId: newId("cell"),
		sessionId: cell.sessionId,
		collection: cell.collection,
		source: {
			origin: "macro_generated",
			authorId,
			createdAt: now,
			updatedAt: now,
		},
		authored: { rawText: newRawText },
		lifecycle: { status: "draft", revision: 1 },
		execution: { generatedCellIds: [] },
		provenance: { sourceCellId: cell.cellId },
		relationships: { supersedesCellId: cell.cellId },
		diagnostics: [],
	};
}
