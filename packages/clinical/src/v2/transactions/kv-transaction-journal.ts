import type { KvBackend } from "@stateful-mcp/core";
import type {
	MacroTransaction,
	RecoveryQuery,
	TransactionJournal,
} from "./transaction-types";

export class KvTransactionJournal implements TransactionJournal {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:macro-transaction:",
	) {}

	async get(transactionId: string): Promise<MacroTransaction | null> {
		const data = await this.backend.load();
		return this.read(data[`${this.prefix}${transactionId}`]);
	}

	async getByIdempotencyKey(
		idempotencyKey: string,
	): Promise<MacroTransaction | null> {
		const data = await this.backend.load();
		for (const value of Object.values(data)) {
			const transaction = this.read(value);
			if (transaction?.idempotencyKey === idempotencyKey) return transaction;
		}
		return null;
	}

	async put(transaction: MacroTransaction): Promise<void> {
		await this.backend.set(
			`${this.prefix}${transaction.transactionId}`,
			JSON.stringify(transaction),
		);
		await this.backend.save();
	}

	async list(query: RecoveryQuery = {}): Promise<MacroTransaction[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((value) => this.read(value))
			.filter((transaction): transaction is MacroTransaction =>
				Boolean(transaction),
			)
			.filter(
				(transaction) =>
					!query.sourceCellId ||
					transaction.sourceCellId === query.sourceCellId,
			)
			.filter(
				(transaction) =>
					!query.statuses || query.statuses.includes(transaction.status),
			);
	}

	private read(value: unknown): MacroTransaction | null {
		if (typeof value !== "string") return null;
		try {
			return JSON.parse(value) as MacroTransaction;
		} catch {
			return null;
		}
	}
}
