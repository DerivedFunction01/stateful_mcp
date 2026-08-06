import type { StructuredCell } from "../cells/structured-cell";
import type { StructuredCellService } from "../cells/structured-cell-service";
import type { ClinicalDocumentService } from "../clinical/clinical-document-service";
import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import type { ClinicalOperation } from "../clinical/clinical-operation";
import { enrichPlanWithCompletionLinkage } from "../clinical/composite-clinical-linkage";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { ProjectionRegistry } from "../projections/projection-registry";
import type { SyncApplicationService } from "../sync/sync-application-service";
import type { SyncEngine } from "../sync/sync-engine";
import type { TransactionCoordinator } from "../transactions/transaction-coordinator";
import type {
	CommittedTransaction,
	PreparedTransaction,
	RecoveryResult,
	TransactionParticipant,
} from "../transactions/transaction-types";
import type { WorkspaceService } from "../workspaces/workspace-service";
import type { WorkspaceAggregate } from "../workspaces/workspace-types";
import type { WorkspaceViewService } from "../workspaces/workspace-view-state";
import type { ClinicalRuntime } from "./clinical-runtime-v2";

export interface ExecutionResult {
	status: "committed" | "failed";
	transactionId: string;
	planFingerprint: string;
	committed?: CommittedTransaction;
	error?: string;
	variable?: {
		operation: string;
		name?: string;
		value?: unknown;
		serialized?: string;
	};
}

/**
 * Thin facade over  domain services. Provides the primary entry point for
 * macro execution (preview → execute → commit) and read-model access.
 */
export class ClinicalEngine {
	constructor(
		private readonly runtime: ClinicalRuntime,
		private readonly coordinator: TransactionCoordinator,
		private readonly participants: readonly TransactionParticipant[],
		private readonly projectionRegistry: ProjectionRegistry | undefined,
		private readonly workspaceService: WorkspaceService,
		private readonly clinicalService: ClinicalDocumentService,
		private readonly cellService: StructuredCellService,
		readonly _viewService: WorkspaceViewService,
		private readonly syncEngine: SyncEngine,
		private readonly syncApplication: SyncApplicationService | undefined,
	) {}

	getRuntime(): ClinicalRuntime {
		return this.runtime;
	}

	getWorkspaceService(): WorkspaceService {
		return this.workspaceService;
	}

	getCellService(): StructuredCellService {
		return this.cellService;
	}

	async initializeClinicalDocument(
		operation: Extract<ClinicalOperation, { kind: "document_initialized" }>,
	) {
		return this.clinicalService.initDocument(operation);
	}

	async prepare(
		plan: MacroExecutionPlan,
		participants?: readonly TransactionParticipant[],
		idempotencyKey?: string,
	): Promise<PreparedTransaction> {
		const effective = participants ?? this.participants;
		const enriched = await this.enrichExpectedVersions(
			await this.enrichIfComposite(plan),
		);
		return this.coordinator.prepare({
			idempotencyKey: idempotencyKey ?? `plan_${enriched.fingerprint.value}`,
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
		let committed: CommittedTransaction;
		try {
			committed = await this.coordinator.commit(transactionId, effective);
		} catch (error) {
			return {
				status: "failed",
				transactionId,
				planFingerprint: "",
				error: error instanceof Error ? error.message : String(error),
			};
		}
		try {
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
			await this.coordinator.markProjectionFailure(transactionId, error);
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
		idempotencyKey?: string,
	): Promise<ExecutionResult> {
		const prepared = await this.prepare(plan, participants, idempotencyKey);
		return this.commit(prepared.transactionId, participants);
	}

	async reverse(
		transactionId: string,
		idempotencyKey: string,
		participants?: readonly TransactionParticipant[],
	): Promise<ExecutionResult> {
		const effective = participants ?? this.participants;
		try {
			const committed = await this.coordinator.reverse(
				transactionId,
				effective,
				idempotencyKey,
			);
			const transaction = await this.coordinator.get(committed.transactionId);
			if (this.projectionRegistry && transaction) {
				await this.projectionRegistry.onCommitted({
					transactionId: committed.transactionId,
					plan: transaction.plan,
					participantStates: transaction.participants,
					syncConfig: this.runtime.stores.syncConfig,
				});
			}
			return {
				status: "committed",
				transactionId: committed.transactionId,
				planFingerprint: transaction?.plan.fingerprint.value ?? "",
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

	async recover(transactionId: string): Promise<RecoveryResult> {
		const recovered = await this.coordinator.recover(
			transactionId,
			this.participants,
		);
		if (recovered.status === "committed" && this.projectionRegistry) {
			const transaction = await this.coordinator.get(transactionId);
			if (transaction) {
				try {
					await this.projectionRegistry.onCommitted({
						transactionId,
						plan: transaction.plan,
						participantStates: transaction.participants,
						syncConfig: this.runtime.stores.syncConfig,
					});
				} catch (error) {
					await this.coordinator.markProjectionFailure(transactionId, error);
					throw error;
				}
			}
		}
		return recovered;
	}

	async syncDocument(documentId: string, workspaceId: string): Promise<void> {
		if (!this.syncApplication)
			throw new Error("Sync application is not configured");
		const document = await this.clinicalService.getDocument(documentId);
		if (!document)
			throw new Error(`Clinical document '${documentId}' was not found`);
		await this.syncApplication.apply(
			workspaceId,
			this.syncEngine.evaluate(document),
		);
	}

	getWorkspace(id: string): Promise<WorkspaceAggregate | null> {
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
		const workspace = await this.workspaceService.getWorkspace(
			plan.scope.workspaceId,
		);
		if (!workspace) return plan;
		return enrichPlanWithCompletionLinkage(plan, workspace);
	}

	private async enrichExpectedVersions(
		plan: MacroExecutionPlan,
	): Promise<MacroExecutionPlan> {
		const expectedVersions = [...plan.expectedVersions];
		const addExpected = (
			aggregateKind: "document" | "workspace",
			aggregateId: string | undefined,
			version: number,
			head: string | undefined,
		) => {
			if (!aggregateId) return;
			if (
				expectedVersions.some(
					(item) =>
						item.aggregateKind === aggregateKind &&
						item.aggregateId === aggregateId,
				)
			)
				return;
			expectedVersions.push({
				aggregateKind,
				aggregateId,
				expectedVersion: version,
				expectedHead: head,
			});
		};
		if (plan.scope.documentId) {
			const document = await this.clinicalService.getDocument(
				plan.scope.documentId,
			);
			if (document)
				addExpected(
					"document",
					plan.scope.documentId,
					document.version,
					document.eventHead,
				);
		}
		if (plan.scope.workspaceId) {
			const workspace = await this.workspaceService.getWorkspace(
				plan.scope.workspaceId,
			);
			if (workspace)
				addExpected(
					"workspace",
					plan.scope.workspaceId,
					workspace.version,
					workspace.eventHead,
				);
		}
		return { ...plan, expectedVersions };
	}
}
