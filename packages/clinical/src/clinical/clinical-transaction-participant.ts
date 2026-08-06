import type {
	EventCommitReceipt,
	ProjectionReceipt,
	TransactionParticipant,
	TransactionParticipantContext,
} from "../transactions/transaction-types";
import type {
	ClinicalDocumentService,
	PreparedClinicalMutation,
} from "./clinical-document-service";

export class ClinicalTransactionParticipant implements TransactionParticipant {
	readonly participantId = "clinical-events";
	readonly kind = "clinical_events" as const;
	private readonly prepared = new Map<string, PreparedClinicalMutation>();
	private readonly receipts = new Map<string, EventCommitReceipt>();

	constructor(private readonly service: ClinicalDocumentService) {}

	async stage(context: TransactionParticipantContext): Promise<void> {
		const documentId =
			context.plan.scope.documentId ??
			context.plan.clinicalOperations?.[0]?.documentId;
		let operations = context.plan.clinicalOperations;
		if (!operations && documentId) {
			const compiled = await this.service.compileMacroTargetsWithReversal(
				documentId,
				context.plan.operations,
				context.plan.writePolicy,
			);
			operations = compiled.operations;
			context.plan.reversal = {
				clinicalOperations: compiled.inverseOperations,
			};
		}
		operations ??= [];
		if (!operations.length) return;
		if (!documentId) throw new Error("Clinical transaction has no document ID");
		let expected = context.plan.expectedVersions.find(
			(item) =>
				item.aggregateKind === "document" && item.aggregateId === documentId,
		);
		if (!expected) {
			const current = await this.service.getDocument(documentId);
			if (current?.eventHead) {
				expected = {
					aggregateKind: "document",
					aggregateId: documentId,
					expectedVersion: current.version,
					expectedHead: current.eventHead,
				};
			}
		}
		if (!expected?.expectedHead)
			throw new Error(
				`Clinical document '${documentId}' has no expected event head`,
			);
		this.prepared.set(
			context.transactionId,
			await this.service.prepareOperations(
				documentId,
				operations,
				expected.expectedVersion,
				expected.expectedHead,
			),
		);
	}

	async appendEvents(
		context: TransactionParticipantContext,
	): Promise<EventCommitReceipt> {
		const existing = this.receipts.get(context.transactionId);
		if (existing) return existing;
		const prepared = this.prepared.get(context.transactionId);
		if (!prepared) return { commitId: "", eventIds: [] };
		const result = await this.service.appendPrepared(
			prepared,
			context.transactionId,
			context.idempotencyKey,
		);
		const receipt = { commitId: result.commitId, eventIds: result.eventIds };
		this.receipts.set(context.transactionId, receipt);
		return receipt;
	}

	async finalize(context: TransactionParticipantContext): Promise<void> {
		const prepared = this.prepared.get(context.transactionId);
		const receipt = this.receipts.get(context.transactionId);
		if (prepared && receipt)
			await this.service.finalizePrepared(prepared, receipt.commitId);
	}

	async project(
		context: TransactionParticipantContext,
	): Promise<ProjectionReceipt> {
		const prepared = this.prepared.get(context.transactionId);
		const receipt = this.receipts.get(context.transactionId);
		if (!prepared || !receipt) return { projectedHead: "" };
		const document = await this.service.rebuildDocument(
			prepared.documentId,
			receipt.commitId,
		);
		if (context.plan.reversal && document.eventHead) {
			context.plan.reversal.expectedHead = document.eventHead;
			context.plan.reversal.expectedVersion = document.version;
		}
		return {
			projectedHead: document.eventHead ?? receipt.commitId,
			aggregates: {
				[prepared.documentId]: {
					version: document.version,
					head: document.eventHead ?? receipt.commitId,
				},
			},
		};
	}
}
