import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class MacroQueryCompiler {
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
			primaryKey: ["macroId"],
			columns: [
				{ name: "macroId", type: "TEXT", nullable: false },
				{ name: "macroName", type: "TEXT", unique: true, nullable: false },
				{ name: "macroTemplate", type: "TEXT", nullable: false },
				{ name: "personnelId", type: "TEXT", nullable: true },
			],
		});

		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_name`,
			columns: ["macroName"],
		});

		return [mainDDL, idx];
	}

	public compileGetByMacroNameQuery(
		macroName: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "macroName", op: "eq", value: macroName }],
		});
	}

	public compileListQuery(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "macroName", direction: "ASC" }],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["macroId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteQuery(macroId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "macroId", op: "eq", value: macroId }],
		});
	}
}
