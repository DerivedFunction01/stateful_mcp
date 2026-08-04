import type { CellCompileContext } from "./cell-compiler";
import type { StructuredCell } from "./structured-cell";

export interface CellStore {
	get(cellId: string): Promise<StructuredCell | null>;
	list(sessionId: string): Promise<StructuredCell[]>;
	listByCollection(
		sessionId: string,
		collection: StructuredCell["collection"],
	): Promise<StructuredCell[]>;
	save(cell: StructuredCell): Promise<void>;
	delete(cellId: string): Promise<void>;
	create(request: CreateCellRequest): Promise<StructuredCell>;
	edit(
		cellId: string,
		rawText: string,
		expectedRevision: number,
	): Promise<StructuredCell>;
	supersede(
		cellId: string,
		newRawText: string,
		expectedRevision: number,
		authorId?: string,
	): Promise<StructuredCell>;
}

export interface CreateCellRequest {
	sessionId: string;
	collection: StructuredCell["collection"];
	rawText: string;
	authorId?: string;
}

export interface EditCellRequest {
	cellId: string;
	rawText: string;
	expectedRevision: number;
}

export interface PreviewCellRequest {
	cellId: string;
	expectedRevision: number;
	context?: CellCompileContext;
}

export interface ExecuteCellRequest {
	cellId: string;
	expectedRevision: number;
	previewId: string;
	planFingerprint: string;
	idempotencyKey: string;
	context?: CellCompileContext;
}

export interface CancelCellRequest {
	cellId: string;
	expectedRevision: number;
}

export interface SupersedeCellRequest {
	cellId: string;
	newRawText: string;
	expectedRevision: number;
	authorId?: string;
}

export interface MarkDeletedRequest {
	cellId: string;
	expectedRevision: number;
}

export interface RestoreDraftCellRequest {
	cellId: string;
	expectedRevision: number;
}

export interface CellPreview {
	previewId: string;
	cellId: string;
	planFingerprint: string;
	diagnostics: string[];
	status: "valid" | "invalid" | "ambiguous";
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

export interface CellExecutionResult {
	transactionId: string;
	status: "pending_commit" | "committed" | "failed" | "recovery_required";
	generatedCellIds: string[];
	diagnostics: string[];
}

export interface CellServiceDeps {
	store: CellStore;
	compile: (
		input: string,
	) => Promise<{ plan?: unknown; diagnostics: string[]; fingerprint: string }>;
}
