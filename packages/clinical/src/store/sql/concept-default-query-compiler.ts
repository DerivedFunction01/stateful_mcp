import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ConceptDefaultQueryCompiler {
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
			primaryKey: ["anchorConceptId", "targetSchema"],
			columns: [
				{ name: "anchorConceptId", type: "TEXT", nullable: false },
				{ name: "targetSchema", type: "TEXT", nullable: false },
				{
					name: "regexPatterns",
					type: "json",
					nullable: false,
					default: "[]",
				},
				{
					name: "defaultProperties",
					type: "json",
					nullable: false,
					default: "{}",
				},
			],
		});

		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_schema`,
			columns: ["targetSchema"],
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
				{ column: "anchorConceptId", op: "eq", value: anchorConceptId },
				{ column: "targetSchema", op: "eq", value: targetSchema },
			],
		});
	}

	public compileListBySchemaQuery(
		targetSchema: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "targetSchema", op: "eq", value: targetSchema }],
			orderBy: [{ column: "anchorConceptId", direction: "ASC" }],
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
				{ column: "anchorConceptId", direction: "ASC" },
				{ column: "targetSchema", direction: "ASC" },
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
				: ["anchorConceptId", "targetSchema"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteQuery(
		anchorConceptId: string,
		targetSchema: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [
				{ column: "anchorConceptId", op: "eq", value: anchorConceptId },
				{ column: "targetSchema", op: "eq", value: targetSchema },
			],
		});
	}
}
