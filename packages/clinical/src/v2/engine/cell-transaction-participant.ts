import type {
	EventCommitReceipt,
	TransactionParticipant,
	TransactionParticipantContext,
} from "../transactions/transaction-types";
import type { CellStore } from "../cells/cell-service-types";
import type { StructuredCell } from "../cells/structured-cell";

/**
 * Transaction participant that marks a cell as committed after the full
 * transaction (workspace events + clinical events) completes.
 *
 * This participant is the durable commit mark: the cell transitions from
 * `pending_commit` to `committed` in the cell store, making it immutable.
 */
export class CellTransactionParticipant implements TransactionParticipant {
	readonly participantId = "cells";
	readonly kind = "cells" as const;
	private readonly pendingCells = new Map<string, string[]>();
	private readonly receipts = new Map<string, EventCommitReceipt>();

	constructor(private readonly store: CellStore) {}

	async stage(context: TransactionParticipantContext): Promise<void> {
		const cellIds = context.plan.generatedCells.map((c) => c.cellRef);
		if (!cellIds.length) {
			const sourceCellId = context.plan.operations[0]?.cellRef;
			if (sourceCellId) cellIds.push(sourceCellId);
		}
		if (cellIds.length) {
			this.pendingCells.set(context.transactionId, cellIds);
		}
	}

	async appendEvents(context: TransactionParticipantContext): Promise<EventCommitReceipt> {
		const existing = this.receipts.get(context.transactionId);
		if (existing) return existing;
		const cellIds = this.pendingCells.get(context.transactionId);
		if (!cellIds?.length) return { commitId: "", eventIds: [] };
		const committedIds: string[] = [];
		for (const cellId of cellIds) {
			const cell = await this.store.get(cellId);
			if (!cell || cell.lifecycle.status === "committed") continue;
			const updated: StructuredCell = {
				...cell,
				lifecycle: { ...cell.lifecycle, status: "committed" },
			};
			await this.store.save(updated);
			committedIds.push(cellId);
		}
		const receipt = { commitId: context.transactionId, eventIds: committedIds };
		this.receipts.set(context.transactionId, receipt);
		return receipt;
	}

	async finalize(_context: TransactionParticipantContext): Promise<void> {
		// Cells are finalized during appendEvents (status → committed).
		// No additional work needed.
	}
}