import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class TransactionQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		const createTable = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["transactionId"],
			columns: [
				{ name: "transactionId", type: "TEXT", nullable: false },
				{ name: "idempotencyKey", type: "TEXT", nullable: false },
				{ name: "sourceCellId", type: "TEXT", nullable: false },
				{ name: "sourceCellRevision", type: "INTEGER", nullable: false },
				{ name: "status", type: "TEXT", nullable: false },
				{ name: "transactionJson", type: "json", nullable: false },
				{ name: "createdAt", type: "TEXT", nullable: false },
				{ name: "updatedAt", type: "TEXT", nullable: false },
			],
		});
		return [
			createTable,
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_idempotency`,
				columns: ["idempotencyKey"],
				unique: true,
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_status`,
				columns: ["status"],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_source_cell`,
				columns: ["sourceCellId"],
			}),
		];
	}

	getByIdQuery(transactionId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "transactionId", op: "eq", value: transactionId }],
		});
	}

	getByIdempotencyQuery(idempotencyKey: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "idempotencyKey", op: "eq", value: idempotencyKey }],
		});
	}

	listQuery(
		sourceCellId: string | undefined,
		statuses: readonly string[] | undefined,
		table: string,
	): CompiledQuery {
		const where: QueryCondition[] = [];
		if (sourceCellId)
			where.push({ column: "sourceCellId", op: "eq", value: sourceCellId });
		if (statuses?.length)
			where.push({ column: "status", op: "in_set", values: [...statuses] });
		return this.compiler.compileSelect({ table, where });
	}

	upsertQuery(
		transaction: {
			transactionId: string;
			idempotencyKey: string;
			sourceCellId: string;
			sourceCellRevision: number;
			status: string;
			transactionJson: string;
			createdAt: string;
			updatedAt: string;
		},
		table: string,
	): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: transaction,
			onConflict: "replace",
			conflictColumns:
				this.dialect === "sqlite" ? undefined : ["transactionId"],
		});
	}
}
