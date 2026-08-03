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
		const operations =
			context.plan.clinicalOperations ??
			(documentId
				? await this.service.compileMacroTargets(
						documentId,
						context.plan.operations,
						context.plan.writePolicy,
					)
				: []);
		if (!operations.length) return;
		if (!documentId) throw new Error("Clinical transaction has no document ID");
		const expected = context.plan.expectedVersions.find(
			(item) =>
				item.aggregateKind === "document" && item.aggregateId === documentId,
		);
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
