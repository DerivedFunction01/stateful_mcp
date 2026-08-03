import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export class CellQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["cellId"],
			columns: [
				{ name: "cellId", type: "TEXT", nullable: false },
				{ name: "sessionId", type: "TEXT", nullable: false },
				{ name: "cellJson", type: "JSON", nullable: false },
			],
		});

		const idxSession = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_session`,
			columns: ["sessionId"],
		});

		return [mainDDL, idxSession];
	}

	public compileGetQuery(cellId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
	}

	public compileListBySessionQuery(
		sessionId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["cellId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteQuery(cellId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
	}
}
