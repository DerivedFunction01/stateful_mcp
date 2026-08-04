import type { ExecutionResult } from "../engine/clinical-engine-v2";
import type { MacroLearningService } from "../learning/macro-learning-service";
import type { MacroLearningTrace } from "../learning/macro-learning-types";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { DeleteEligibility } from "../notebook/notebook-state";
import { NotebookPreviewWorkflow } from "../notebook/preview-workflow";
import type { CellCompileContext } from "./cell-compiler";
import type {
	CancelCellRequest,
	CellExecutionResult,
	CellPreview,
	CellStore,
	CreateCellRequest,
	EditCellRequest,
	ExecuteCellRequest,
	MarkDeletedRequest,
	PreviewCellRequest,
	RestoreDraftCellRequest,
	SupersedeCellRequest,
} from "./cell-service-types";
import type { StructuredCell } from "./structured-cell";

export interface StructuredCellServiceDeps {
	store: CellStore;
	compile: (
		rawText: string,
		context?: CellCompileContext,
	) => Promise<{
		plan?: MacroExecutionPlan;
		diagnostics: string[];
		fingerprint: string;
		learningTrace?: MacroLearningTrace;
	}>;
	previewWorkflow?: NotebookPreviewWorkflow;
	executePlan?: (plan: MacroExecutionPlan) => Promise<ExecutionResult>;
	learningService?: MacroLearningService;
}

export class StructuredCellService {
	private readonly store: CellStore;
	private readonly compile: StructuredCellServiceDeps["compile"];
	private readonly previewWorkflow: NotebookPreviewWorkflow;
	private executePlan?: StructuredCellServiceDeps["executePlan"];
	private readonly learningService?: MacroLearningService;

	constructor(deps: StructuredCellServiceDeps) {
		this.store = deps.store;
		this.compile = deps.compile;
		this.previewWorkflow =
			deps.previewWorkflow ??
			new NotebookPreviewWorkflow({ compile: deps.compile });
		this.executePlan = deps.executePlan;
		this.learningService = deps.learningService;
	}

	setPlanExecutor(
		executePlan: NonNullable<StructuredCellServiceDeps["executePlan"]>,
	): void {
		this.executePlan = executePlan;
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
		const result = await this.previewWorkflow.preview(cell, request.context);
		const previewId = `preview_${cell.cellId}_${cell.lifecycle.revision}`;
		const status: CellPreview["status"] =
			result.diagnostics.length > 0 ? "invalid" : "valid";
		return {
			previewId,
			cellId: cell.cellId,
			planFingerprint: result.fingerprint,
			diagnostics: [...result.diagnostics],
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
		const expectedPreviewId = `preview_${cell.cellId}_${cell.lifecycle.revision}`;
		if (expectedPreviewId !== request.previewId) {
			throw new Error(`Cell '${request.cellId}' preview mismatch`);
		}
		const compiled = await this.compile(cell.authored.rawText, request.context);
		if (compiled.fingerprint !== request.planFingerprint) {
			throw new Error(`Cell '${request.cellId}' plan fingerprint mismatch`);
		}
		if (compiled.diagnostics.length > 0) {
			throw new Error(`Cell '${request.cellId}' preview is invalid`);
		}
		if (!compiled.plan)
			throw new Error(
				`Cell '${cell.cellId}' did not produce an execution plan`,
			);
		if (compiled.learningTrace && this.learningService) {
			await this.learningService.recordTrace({
				...compiled.learningTrace,
				observationMode: "execution",
				outcome: "positive",
				correlationId: request.idempotencyKey,
			});
		}
		if (!this.executePlan)
			throw new Error("StructuredCellService execution is not configured");
		const plan: MacroExecutionPlan = {
			...compiled.plan,
			operations: compiled.plan.operations.map((operation) => ({
				...operation,
				cellRef: operation.cellRef ?? cell.cellId,
			})),
		};
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
		const result = await this.executePlan(plan);
		const finalStatus = result.status === "committed" ? "committed" : "failed";
		const finalCell: StructuredCell = {
			...updated,
			lifecycle: {
				...updated.lifecycle,
				status: finalStatus,
				revision: updated.lifecycle.revision + 1,
			},
			source: { ...updated.source, updatedAt: new Date().toISOString() },
			execution: {
				...updated.execution,
				planFingerprint: compiled.fingerprint,
				committedAt:
					result.status === "committed" ? new Date().toISOString() : undefined,
			},
			diagnostics: result.error
				? [{ code: "execution", severity: "error", message: result.error }]
				: [],
		};
		await this.store.save(finalCell);
		return {
			transactionId: result.transactionId,
			status: result.status === "committed" ? "committed" : "failed",
			generatedCellIds: plan.generatedCells.map(
				(generated) => generated.cellRef,
			),
			diagnostics: result.error ? [result.error] : [],
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

	canDelete(cell: StructuredCell): DeleteEligibility {
		switch (cell.lifecycle.status) {
			case "committed":
			case "locked":
			case "deleted":
				return { eligible: false, reason: cell.lifecycle.status };
			case "pending_commit":
				return { eligible: false, reason: "pending_commit" };
			default:
				return { eligible: true };
		}
	}

	async markDeleted(request: MarkDeletedRequest): Promise<StructuredCell> {
		const cell = await this.store.get(request.cellId);
		if (!cell) throw new Error(`Cell '${request.cellId}' not found`);
		const eligibility = this.canDelete(cell);
		if (!eligibility.eligible) {
			throw new Error(
				`Cell '${request.cellId}' is not eligible for deletion: ${eligibility.reason}`,
			);
		}
		const now = new Date().toISOString();
		const updated: StructuredCell = {
			...cell,
			lifecycle: {
				...cell.lifecycle,
				status: "deleted",
				revision: cell.lifecycle.revision + 1,
			},
			source: { ...cell.source, updatedAt: now },
		};
		await this.store.save(updated);
		return updated;
	}

	async restoreDraftCell(
		request: RestoreDraftCellRequest,
	): Promise<StructuredCell> {
		const cell = await this.store.get(request.cellId);
		if (!cell) throw new Error(`Cell '${request.cellId}' not found`);
		const now = new Date().toISOString();
		const updated: StructuredCell = {
			...cell,
			lifecycle: {
				...cell.lifecycle,
				status: "draft",
				revision: cell.lifecycle.revision + 1,
			},
			source: { ...cell.source, updatedAt: now },
		};
		await this.store.save(updated);
		return updated;
	}
}
