import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class CommandTemplateQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["templateId"],
				columns: [
					{ name: "templateId", type: "TEXT", nullable: false },
					{ name: "templateName", type: "TEXT", nullable: true },
					{ name: "stage", type: "TEXT", nullable: false },
					{ name: "macroId", type: "TEXT", nullable: true },
					{ name: "workspaceId", type: "TEXT", nullable: true },
					{ name: "specialtyId", type: "TEXT", nullable: true },
					{ name: "active", type: "INTEGER", nullable: false },
					{ name: "templateText", type: "TEXT", nullable: false },
					{ name: "slotsBlob", type: "json", nullable: false },
					{ name: "parentTemplateId", type: "TEXT", nullable: true },
				],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_lookup`,
				columns: ["macroId", "stage", "workspaceId", "specialtyId"],
			}),
		];
	}

	compileGetQuery(templateId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "templateId", op: "eq", value: templateId }],
		});
	}

	compileListQuery(table: string, where?: QueryCondition[]): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [
				{ column: "templateName", direction: "ASC" },
				{ column: "templateId", direction: "ASC" },
			],
		});
	}

	compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns: this.dialect === "sqlite" ? undefined : ["templateId"],
		});
	}

	compileDeleteQuery(templateId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "templateId", op: "eq", value: templateId }],
		});
	}
}
