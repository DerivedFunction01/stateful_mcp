import type {
	EventCommitReceipt,
	TransactionParticipant,
	TransactionParticipantContext,
} from "../transactions/transaction-types";
import type {
	PreparedWorkspaceMutation,
	WorkspaceService,
} from "./workspace-service";

export class WorkspaceTransactionParticipant implements TransactionParticipant {
	readonly participantId = "workspace-events";
	readonly kind = "workspace_events" as const;
	private readonly prepared = new Map<string, PreparedWorkspaceMutation>();
	private readonly receipts = new Map<string, EventCommitReceipt>();

	constructor(private readonly service: WorkspaceService) {}

	async stage(context: TransactionParticipantContext): Promise<void> {
		const operations = context.plan.workspaceOperations ?? [];
		if (!operations.length) return;
		const workspaceId =
			context.plan.scope.workspaceId ?? operations[0]?.workspaceId;
		if (!workspaceId)
			throw new Error("Workspace transaction has no workspace ID");
		const expected = context.plan.expectedVersions.find(
			(item) =>
				item.aggregateKind === "workspace" && item.aggregateId === workspaceId,
		);
		if (!expected)
			throw new Error(`Workspace '${workspaceId}' has no expected version`);
		this.prepared.set(
			context.transactionId,
			await this.service.prepareOperations(
				workspaceId,
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
		const receipt = {
			commitId: result.commitId,
			eventIds: result.records.map((record) => record.eventId),
		};
		this.receipts.set(context.transactionId, receipt);
		return receipt;
	}

	async finalize(context: TransactionParticipantContext): Promise<void> {
		const prepared = this.prepared.get(context.transactionId);
		const receipt = this.receipts.get(context.transactionId);
		if (prepared && receipt)
			await this.service.finalizePrepared(prepared, receipt.commitId);
	}
}
