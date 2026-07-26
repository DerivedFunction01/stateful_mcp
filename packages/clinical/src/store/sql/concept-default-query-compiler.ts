import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ConceptDefaultQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "postgres") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["anchor_concept_id", "target_schema"],
			columns: [
				{ name: "anchor_concept_id", type: "TEXT", nullable: false },
				{ name: "target_schema", type: "TEXT", nullable: false },
				{
					name: "regex_patterns",
					type: "json",
					nullable: false,
					default: "[]",
				},
				{
					name: "default_properties",
					type: "json",
					nullable: false,
					default: "{}",
				},
			],
		});

		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_schema`,
			columns: ["target_schema"],
		});

		return [mainDDL, idx];
	}

	public compileGetQuery(
		anchorConceptId: string,
		targetSchema: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [
				{ column: "anchor_concept_id", op: "eq", value: anchorConceptId },
				{ column: "target_schema", op: "eq", value: targetSchema },
			],
		});
	}

	public compileListBySchemaQuery(
		targetSchema: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "target_schema", op: "eq", value: targetSchema }],
			orderBy: [{ column: "anchor_concept_id", direction: "ASC" }],
		});
	}

	public compileListQuery(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [
				{ column: "anchor_concept_id", direction: "ASC" },
				{ column: "target_schema", direction: "ASC" },
			],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite"
				? undefined
				: ["anchor_concept_id", "target_schema"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}
}
