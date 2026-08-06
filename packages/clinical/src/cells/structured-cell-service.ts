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
	executePlan?: (
		plan: MacroExecutionPlan,
		idempotencyKey?: string,
	) => Promise<ExecutionResult>;
	reversePlan?: (
		transactionId: string,
		idempotencyKey: string,
	) => Promise<ExecutionResult>;
	learningService?: MacroLearningService;
}

export class StructuredCellService {
	private readonly store: CellStore;
	private readonly compile: StructuredCellServiceDeps["compile"];
	private readonly previewWorkflow: NotebookPreviewWorkflow;
	private executePlan?: StructuredCellServiceDeps["executePlan"];
	private reversePlan?: StructuredCellServiceDeps["reversePlan"];
	private readonly learningService?: MacroLearningService;

	constructor(deps: StructuredCellServiceDeps) {
		this.store = deps.store;
		this.compile = deps.compile;
		this.previewWorkflow =
			deps.previewWorkflow ??
			new NotebookPreviewWorkflow({ compile: deps.compile });
		this.executePlan = deps.executePlan;
		this.reversePlan = deps.reversePlan;
		this.learningService = deps.learningService;
	}

	setPlanExecutor(
		executePlan: NonNullable<StructuredCellServiceDeps["executePlan"]>,
	): void {
		this.executePlan = executePlan;
	}

	setPlanReverser(
		reversePlan: NonNullable<StructuredCellServiceDeps["reversePlan"]>,
	): void {
		this.reversePlan = reversePlan;
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
		if (cell.authored.finalizedMacro) {
			return {
				previewId: `preview_${cell.cellId}_${cell.lifecycle.revision}`,
				cellId: cell.cellId,
				planFingerprint: cell.authored.finalizedMacro.fingerprint,
				diagnostics: cell.authored.finalizedMacro.diagnostics.map(
					(diagnostic) => diagnostic.message,
				),
				status:
					cell.authored.finalizedMacro.diagnostics.length === 0
						? "valid"
						: "invalid",
			};
		}
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
		if (cell.authored.finalizedMacro) {
			return this.executeFinalizedMacro(request.cellId, request.idempotencyKey);
		}
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
		const result = await this.executePlan(plan, request.idempotencyKey);
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

	/** Execute the exact plan captured by the Macro authoring session. */
	async executeFinalizedMacro(
		cellId: string,
		idempotencyKey: string,
	): Promise<CellExecutionResult> {
		const cell = await this.store.get(cellId);
		if (!cell) throw new Error(`Cell '${cellId}' not found`);
		const finalized = cell.authored.finalizedMacro;
		if (!finalized) {
			throw new Error(`Cell '${cellId}' has no finalized Macro snapshot`);
		}
		if (finalized.diagnostics.length > 0) {
			throw new Error(`Cell '${cellId}' finalized Macro is invalid`);
		}
		if (finalized.fingerprint !== finalized.plan.fingerprint.value) {
			throw new Error(`Cell '${cellId}' finalized Macro fingerprint mismatch`);
		}
		if (cell.execution.planFingerprint !== finalized.fingerprint) {
			throw new Error(`Cell '${cellId}' stored plan fingerprint mismatch`);
		}
		if (cell.lifecycle.status === "committed") {
			return {
				transactionId: cell.execution.transactionId ?? "",
				status: "committed",
				generatedCellIds: cell.execution.generatedCellIds ?? [],
				diagnostics: ["Cell is already committed; rerun creates a new cell"],
			};
		}
		if (!this.executePlan)
			throw new Error("StructuredCellService execution is not configured");

		const plan: MacroExecutionPlan = {
			...finalized.plan,
			operations: finalized.plan.operations.map((operation) => ({
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
				transactionId:
					cell.execution.transactionId ?? `tx_${crypto.randomUUID()}`,
			},
		};
		await this.store.save(updated);
		const result = await this.executePlan(plan, idempotencyKey);
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
				planFingerprint: finalized.fingerprint,
				transactionId: result.transactionId,
				committedAt:
					result.status === "committed" ? new Date().toISOString() : undefined,
				generatedCellIds: plan.generatedCells.map(
					(generated) => generated.cellRef,
				),
			},
			diagnostics: result.error
				? [{ code: "execution", severity: "error", message: result.error }]
				: [],
		};
		await this.store.save(finalCell);
		return {
			transactionId: result.transactionId,
			status: finalStatus,
			generatedCellIds: plan.generatedCells.map(
				(generated) => generated.cellRef,
			),
			diagnostics: result.error ? [result.error] : [],
		};
	}

	async reverseFinalizedMacro(
		cellId: string,
		idempotencyKey: string,
	): Promise<CellExecutionResult> {
		const cell = await this.store.get(cellId);
		if (!cell) throw new Error(`Cell '${cellId}' not found`);
		if (!cell.authored.finalizedMacro || !cell.execution.transactionId)
			throw new Error(`Cell '${cellId}' has no committed Macro transaction`);
		if (cell.lifecycle.status !== "committed")
			throw new Error(`Cell '${cellId}' has no committed Macro transaction`);
		if (cell.execution.reversalTransactionId) {
			return {
				status: "committed",
				transactionId: cell.execution.reversalTransactionId,
				generatedCellIds: [],
				diagnostics: ["Macro was already reversed"],
			};
		}
		if (!this.reversePlan)
			throw new Error("StructuredCellService reversal is not configured");
		const result = await this.reversePlan(
			cell.execution.transactionId,
			idempotencyKey,
		);
		if (result.status === "committed") {
			await this.store.save({
				...cell,
				source: { ...cell.source, updatedAt: new Date().toISOString() },
				execution: {
					...cell.execution,
					reversalTransactionId: result.transactionId,
					reversedAt: new Date().toISOString(),
				},
				lifecycle: {
					...cell.lifecycle,
					revision: cell.lifecycle.revision + 1,
				},
			});
		}
		return {
			status: result.status,
			transactionId: result.transactionId,
			generatedCellIds: [],
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
