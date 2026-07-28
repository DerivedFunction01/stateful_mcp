import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class AnchorQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const anchorDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "ruleId", type: "TEXT", primaryKey: true },
				{ name: "targetSchema", type: "TEXT", nullable: false },
				{ name: "workspaceId", type: "TEXT" },
				{ name: "personnelId", type: "TEXT" },
				{ name: "anchors", type: "json", nullable: false },
			],
		});
		return [anchorDDL];
	}

	public getIndexDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_schema_context`,
				columns: ["targetSchema", "workspaceId", "personnelId"],
			}),
		];
	}

	public compileGetQuery(ruleId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "ruleId", op: "eq", value: ruleId }],
		});
	}

	public compileListBySchemaQuery(
		targetSchema: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "targetSchema", op: "eq", value: targetSchema }],
			orderBy: [{ column: "ruleId", direction: "ASC" }],
		});
	}

	public compileListQuery(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "ruleId", direction: "ASC" }],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["ruleId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteQuery(ruleId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "ruleId", op: "eq", value: ruleId }],
		});
	}
}
