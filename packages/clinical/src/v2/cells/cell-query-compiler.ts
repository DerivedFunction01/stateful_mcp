import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export interface CellRow {
	cellId: string;
	sessionId: string;
	collectionKind: string;
	collectionId: string;
	cellJson: string;
}

export class CellQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["cellId"],
				columns: [
					{ name: "cellId", type: "TEXT", nullable: false },
					{ name: "sessionId", type: "TEXT", nullable: false },
					{ name: "collectionKind", type: "TEXT", nullable: false },
					{ name: "collectionId", type: "TEXT", nullable: false },
					{ name: "cellJson", type: "TEXT", nullable: false },
				],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_session`,
				columns: ["sessionId"],
			}),
		];
	}

	getByIdQuery(cellId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
	}

	listBySessionQuery(sessionId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
	}

	listByCollectionQuery(
		sessionId: string,
		collectionKind: string,
		collectionId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [
				{ column: "sessionId", op: "eq", value: sessionId },
				{ column: "collectionKind", op: "eq", value: collectionKind },
				{ column: "collectionId", op: "eq", value: collectionId },
			],
		});
	}

	upsertQuery(row: CellRow, table: string): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns: this.dialect === "sqlite" ? undefined : ["cellId"],
		});
	}

	deleteQuery(cellId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
	}
}
