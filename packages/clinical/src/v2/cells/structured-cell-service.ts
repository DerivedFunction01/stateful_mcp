import type {
	CancelCellRequest,
	CellExecutionResult,
	CellPreview,
	CellStore,
	CreateCellRequest,
	EditCellRequest,
	ExecuteCellRequest,
	PreviewCellRequest,
	SupersedeCellRequest,
} from "./cell-service-types";
import type { StructuredCell } from "./structured-cell";

export interface StructuredCellServiceDeps {
	store: CellStore;
	compile: (
		rawText: string,
	) => Promise<{ plan?: unknown; diagnostics: string[]; fingerprint: string }>;
}

export class StructuredCellService {
	private readonly store: CellStore;
	private readonly compile: StructuredCellServiceDeps["compile"];

	constructor(deps: StructuredCellServiceDeps) {
		this.store = deps.store;
		this.compile = deps.compile;
	}

	async create(request: CreateCellRequest): Promise<StructuredCell> {
		return this.store.create(request);
	}

	async get(cellId: string): Promise<StructuredCell | null> {
		return this.store.get(cellId);
	}

	async list(sessionId: string): Promise<StructuredCell[]> {
		return this.store.list(sessionId);
	}

	async edit(request: EditCellRequest): Promise<StructuredCell> {
		return this.store.edit(
			request.cellId,
			request.rawText,
			request.expectedRevision,
		);
	}

	async preview(request: PreviewCellRequest): Promise<CellPreview> {
		const cell = await this.store.get(request.cellId);
		if (!cell) throw new Error(`Cell '${request.cellId}' not found`);
		if (cell.lifecycle.status === "committed") {
			return {
				previewId: `preview_${cell.cellId}_${cell.lifecycle.revision}`,
				cellId: cell.cellId,
				planFingerprint: cell.execution.planFingerprint ?? "",
				diagnostics: [],
				status: "valid",
			};
		}
		const result = await this.compile(cell.authored.rawText);
		const previewId = `preview_${cell.cellId}_${cell.lifecycle.revision}`;
		const status: CellPreview["status"] =
			result.diagnostics.length > 0 ? "invalid" : "valid";
		const persisted: StructuredCell = {
			...cell,
			lifecycle: {
				...cell.lifecycle,
				status:
					cell.lifecycle.status === "draft" ? "preview" : cell.lifecycle.status,
			},
			execution: {
				...cell.execution,
				previewId,
				planFingerprint: result.fingerprint,
			},
		};
		if (
			persisted.execution.previewId !== cell.execution.previewId ||
			persisted.execution.planFingerprint !== cell.execution.planFingerprint ||
			persisted.lifecycle.status !== cell.lifecycle.status
		) {
			await this.store.save(persisted);
		}
		return {
			previewId,
			cellId: cell.cellId,
			planFingerprint: result.fingerprint,
			diagnostics: result.diagnostics,
			status,
		};
	}

	async execute(request: ExecuteCellRequest): Promise<CellExecutionResult> {
		const cell = await this.store.get(request.cellId);
		if (!cell) throw new Error(`Cell '${request.cellId}' not found`);
		if (cell.lifecycle.status === "committed") {
			return {
				transactionId: "",
				status: "committed",
				generatedCellIds: [],
				diagnostics: ["Cell is already committed; rerun creates a new cell"],
			};
		}
		if (cell.lifecycle.revision !== request.expectedRevision) {
			throw new Error(`Cell '${request.cellId}' revision mismatch`);
		}
		if (cell.execution.previewId !== request.previewId) {
			throw new Error(`Cell '${request.cellId}' preview mismatch`);
		}
		if (cell.execution.planFingerprint !== request.planFingerprint) {
			throw new Error(`Cell '${request.cellId}' plan fingerprint mismatch`);
		}
		const now = new Date().toISOString();
		const updated: StructuredCell = {
			...cell,
			lifecycle: {
				...cell.lifecycle,
				status: "pending_commit",
				revision: cell.lifecycle.revision + 1,
			},
			source: { ...cell.source, updatedAt: now },
			execution: {
				...cell.execution,
				transactionId: `tx_${crypto.randomUUID()}`,
			},
		};
		await this.store.save(updated);
		return {
			transactionId: updated.execution.transactionId ?? "",
			status: "committed",
			generatedCellIds: [],
			diagnostics: [],
		};
	}

	async cancel(request: CancelCellRequest): Promise<StructuredCell> {
		const cell = await this.store.get(request.cellId);
		if (!cell) throw new Error(`Cell '${request.cellId}' not found`);
		if (cell.lifecycle.status === "committed")
			throw new Error(`Cell '${request.cellId}' is immutable`);
		const now = new Date().toISOString();
		const updated: StructuredCell = {
			...cell,
			lifecycle: {
				...cell.lifecycle,
				status: "cancelled",
				revision: cell.lifecycle.revision + 1,
			},
			source: { ...cell.source, updatedAt: now },
		};
		await this.store.save(updated);
		return updated;
	}

	async supersede(request: SupersedeCellRequest): Promise<StructuredCell> {
		return this.store.supersede(
			request.cellId,
			request.newRawText,
			request.expectedRevision,
			request.authorId,
		);
	}
}
