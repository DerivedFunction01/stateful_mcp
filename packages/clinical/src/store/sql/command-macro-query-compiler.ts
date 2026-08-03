import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class CommandMacroQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["macroId"],
				columns: [
					{ name: "macroId", type: "TEXT", nullable: false },
					{ name: "macroName", type: "TEXT", nullable: false },
					{ name: "version", type: "INTEGER", nullable: false },
					{ name: "active", type: "INTEGER", nullable: false },
					{ name: "personnelId", type: "TEXT", nullable: true },
					{ name: "profileId", type: "TEXT", nullable: true },
					{ name: "definition", type: "json", nullable: false },
				],
				uniques: [["macroName", "version"]],
			}),
		];
	}

	getIndexDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_name_active`,
				columns: ["macroName", "active"],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_context`,
				columns: ["personnelId", "profileId", "active"],
			}),
		];
	}

	compileGetQuery(
		macroName: string,
		table: string,
		context?: { personnelId?: string; profileId?: string },
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: this.contextConditions(
				[{ column: "macroName", op: "eq", value: macroName }],
				context,
			),
			orderBy: [{ column: "version", direction: "DESC" }],
			limit: 1,
		});
	}

	compileListQuery(
		table: string,
		context?: { personnelId?: string; profileId?: string },
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: this.contextConditions([], context),
			orderBy: [
				{ column: "macroName", direction: "ASC" },
				{ column: "version", direction: "DESC" },
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
			conflictColumns: this.dialect === "sqlite" ? undefined : ["macroId"],
		});
	}

	compileDeleteQuery(macroId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "macroId", op: "eq", value: macroId }],
		});
	}

	private contextConditions(
		base: QueryCondition[],
		context?: { personnelId?: string; profileId?: string },
	): QueryCondition[] {
		const conditions: QueryCondition[] = [
			...base,
			{ column: "active", op: "eq", value: 1 },
		];
		if (context?.personnelId !== undefined)
			conditions.push({
				OR: [
					{ column: "personnelId", op: "eq", value: context.personnelId },
					{ column: "personnelId", op: "is_null" },
				],
			});
		if (context?.profileId !== undefined)
			conditions.push({
				OR: [
					{ column: "profileId", op: "eq", value: context.profileId },
					{ column: "profileId", op: "is_null" },
				],
			});
		return conditions;
	}
}
