import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ConceptFieldQueryCompiler {
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
			primaryKey: ["conceptId", "targetSchema", "fieldPath"],
			columns: [
				{ name: "conceptId", type: "TEXT", nullable: false },
				{ name: "targetSchema", type: "TEXT", nullable: false },
				{ name: "fieldPath", type: "TEXT", nullable: false },
				{ name: "ruleId", type: "TEXT", nullable: false },
			],
		});

		const idxSchema = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_schema`,
			columns: ["targetSchema"],
		});

		const idxConcept = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_concept`,
			columns: ["conceptId"],
		});

		return [mainDDL, idxSchema, idxConcept];
	}

	public compileGetQuery(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [
				{ column: "conceptId", op: "eq", value: conceptId },
				{ column: "targetSchema", op: "eq", value: targetSchema },
				{ column: "fieldPath", op: "eq", value: fieldPath },
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
			orderBy: [{ column: "conceptId", direction: "ASC" }],
		});
	}

	public compileListByConceptQuery(
		conceptId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "conceptId", op: "eq", value: conceptId }],
			orderBy: [{ column: "targetSchema", direction: "ASC" }],
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
				{ column: "conceptId", direction: "ASC" },
				{ column: "targetSchema", direction: "ASC" },
				{ column: "fieldPath", direction: "ASC" },
			],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["conceptId", "targetSchema", "fieldPath"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteQuery(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [
				{ column: "conceptId", op: "eq", value: conceptId },
				{ column: "targetSchema", op: "eq", value: targetSchema },
				{ column: "fieldPath", op: "eq", value: fieldPath },
			],
		});
	}
}
