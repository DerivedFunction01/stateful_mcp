import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { TransactionCoordinator } from "../transactions/transaction-coordinator";
import type {
	CommittedTransaction,
	PreparedTransaction,
	RecoveryResult,
	TransactionParticipant,
} from "../transactions/transaction-types";
import type { ClinicalDocumentService } from "../clinical/clinical-document-service";
import type { WorkspaceService } from "../workspaces/workspace-service";
import type { WorkspaceViewService } from "../workspaces/workspace-view-state";
import type { StructuredCellService } from "../cells/structured-cell-service";
import type { SyncEngine } from "../sync/sync-engine";
import type { ProjectionRegistry } from "../projections/projection-registry";
import type { ClinicalRuntimeV2 } from "./clinical-runtime-v2";
import { enrichPlanWithCompletionLinkage } from "../clinical/composite-clinical-linkage";
import type { V2WorkspaceAggregate } from "../workspaces/workspace-types";
import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import type { StructuredCell } from "../cells/structured-cell";

export interface ExecutionResult {
	status: "committed" | "failed";
	transactionId: string;
	planFingerprint: string;
	committed?: CommittedTransaction;
	error?: string;
}

/**
 * Thin facade over V2 domain services. Provides the primary entry point for
 * macro execution (preview → execute → commit) and read-model access.
 */
export class ClinicalEngineV2 {
	constructor(
		private readonly runtime: ClinicalRuntimeV2,
		private readonly coordinator: TransactionCoordinator,
		private readonly participants: readonly TransactionParticipant[],
		private readonly projectionRegistry: ProjectionRegistry | undefined,
		private readonly workspaceService: WorkspaceService,
		private readonly clinicalService: ClinicalDocumentService,
		private readonly cellService: StructuredCellService,
		private readonly viewService: WorkspaceViewService,
		private readonly syncEngine: SyncEngine,
	) {}

	async prepare(
		plan: MacroExecutionPlan,
		participants?: readonly TransactionParticipant[],
	): Promise<PreparedTransaction> {
		const effective = participants ?? this.participants;
		const enriched = await this.enrichIfComposite(plan);
		return this.coordinator.prepare({
			idempotencyKey: `plan_${enriched.fingerprint.value}`,
			sourceCellId: plan.operations[0]?.cellRef ?? "",
			sourceCellRevision: 1,
			plan: enriched,
			participants: effective,
		});
	}

	async commit(
		transactionId: string,
		participants?: readonly TransactionParticipant[],
	): Promise<ExecutionResult> {
		const effective = participants ?? this.participants;
		try {
			const committed = await this.coordinator.commit(transactionId, effective);
			const plan = (await this.coordinator.get(transactionId))?.plan;
			if (this.projectionRegistry && plan) {
				const tx = await this.coordinator.get(transactionId);
				if (tx) {
					await this.projectionRegistry.onCommitted({
						transactionId,
						plan,
						participantStates: tx.participants,
						syncConfig: this.runtime.stores.syncConfig,
					});
				}
			}
			return {
				status: "committed",
				transactionId,
				planFingerprint: plan?.fingerprint?.value ?? "",
				committed,
			};
		} catch (error) {
			return {
				status: "failed",
				transactionId,
				planFingerprint: "",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async executePlan(
		plan: MacroExecutionPlan,
		participants?: readonly TransactionParticipant[],
	): Promise<ExecutionResult> {
		const prepared = await this.prepare(plan, participants);
		return this.commit(prepared.transactionId, participants);
	}

	async recover(transactionId: string): Promise<RecoveryResult> {
		return this.coordinator.recover(transactionId, this.participants);
	}

	getWorkspace(id: string): Promise<V2WorkspaceAggregate | null> {
		return this.workspaceService.getWorkspace(id);
	}

	getDocument(id: string): Promise<ClinicalDocumentReadModel | null> {
		return this.clinicalService.getDocument(id);
	}

	getCell(id: string): Promise<StructuredCell | null> {
		return this.cellService.get(id);
	}

	private async enrichIfComposite(
		plan: MacroExecutionPlan,
	): Promise<MacroExecutionPlan> {
		if (plan.scope.kind !== "composite" || !plan.scope.workspaceId) return plan;
		const workspace = await this.workspaceService.getWorkspace(plan.scope.workspaceId);
		if (!workspace) return plan;
		return enrichPlanWithCompletionLinkage(plan, workspace);
	}
}