import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { MacroTransaction, RecoveryQuery, TransactionJournal } from "./transaction-types";
import { TransactionQueryCompiler } from "./transaction-query-compiler";

export class SqlTransactionJournal implements TransactionJournal {
	private readonly compiler: TransactionQueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_macro_transactions",
	) {
		this.compiler = new TransactionQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	async get(transactionId: string): Promise<MacroTransaction | null> {
		await this.ready;
		const query = this.compiler.getByIdQuery(transactionId, this.table);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? this.fromRow(row) : null;
	}

	async getByIdempotencyKey(idempotencyKey: string): Promise<MacroTransaction | null> {
		await this.ready;
		const query = this.compiler.getByIdempotencyQuery(idempotencyKey, this.table);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? this.fromRow(row) : null;
	}

	async put(transaction: MacroTransaction): Promise<void> {
		await this.ready;
		const query = this.compiler.upsertQuery({
			transactionId: transaction.transactionId,
			idempotencyKey: transaction.idempotencyKey,
			sourceCellId: transaction.sourceCellId,
			sourceCellRevision: transaction.sourceCellRevision,
			status: transaction.status,
			transactionJson: JSON.stringify(transaction),
			createdAt: transaction.createdAt,
			updatedAt: transaction.updatedAt,
		}, this.table);
		await this.executor.exec(query.sql, query.params);
	}

	async list(query: RecoveryQuery = {}): Promise<MacroTransaction[]> {
		await this.ready;
		const compiled = this.compiler.listQuery(query.sourceCellId, query.statuses, this.table);
		const rows = await this.executor.query(compiled.sql, compiled.params);
		return rows.map((row) => this.fromRow(row));
	}

	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table)) await this.executor.exec(query.sql, query.params);
	}

	private fromRow(row: Record<string, unknown>): MacroTransaction {
		if (typeof row.transactionJson === "string") return JSON.parse(row.transactionJson) as MacroTransaction;
		return row.transactionJson as MacroTransaction;
	}
}
