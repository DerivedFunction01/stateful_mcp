import { QueryCompiler, type CompiledQuery, type QueryCondition, type SqlDialect } from "@stateful-mcp/core";

export class V2MacroQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		return [this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["macroId"],
			columns: [
				{ name: "macroId", type: "TEXT", nullable: false },
				{ name: "macroName", type: "TEXT", nullable: false },
				{ name: "version", type: "INTEGER", nullable: false },
				{ name: "active", type: "INTEGER", nullable: false },
				{ name: "status", type: "TEXT", nullable: false },
				{ name: "personnelId", type: "TEXT", nullable: true },
				{ name: "profileId", type: "TEXT", nullable: true },
				{ name: "definition", type: "json", nullable: false },
			],
			uniques: [["macroName", "version"]],
		})];
	}

	getIndexDDL(table: string): CompiledQuery[] {
		return [this.compiler.compileCreateIndex({ table, name: `idx_${table}_name_context`, columns: ["macroName", "personnelId", "profileId", "active"] })];
	}

	getQuery(name: string, table: string, context?: { personnelId?: string; profileId?: string }): CompiledQuery {
		return this.compiler.compileSelect({ table, where: this.conditions([{ column: "macroName", op: "eq", value: name }], context), orderBy: [{ column: "version", direction: "DESC" }], limit: 1 });
	}

	listQuery(table: string, context?: { personnelId?: string; profileId?: string }): CompiledQuery {
		return this.compiler.compileSelect({ table, where: this.conditions([], context), orderBy: [{ column: "macroName", direction: "ASC" }, { column: "version", direction: "DESC" }] });
	}

	upsertQuery(row: Record<string, unknown>, table: string): CompiledQuery {
		return this.compiler.compileInsert({ table, values: row, onConflict: "replace", conflictColumns: this.dialect === "sqlite" ? undefined : ["macroId"] });
	}

	deleteQuery(macroId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({ table, where: [{ column: "macroId", op: "eq", value: macroId }] });
	}

	private conditions(base: QueryCondition[], context?: { personnelId?: string; profileId?: string }): QueryCondition[] {
		const result: QueryCondition[] = [...base, { column: "active", op: "eq", value: 1 }, { column: "status", op: "eq", value: "published" }];
		if (context?.personnelId !== undefined) result.push({ OR: [{ column: "personnelId", op: "eq", value: context.personnelId }, { column: "personnelId", op: "is_null" }] });
		if (context?.profileId !== undefined) result.push({ OR: [{ column: "profileId", op: "eq", value: context.profileId }, { column: "profileId", op: "is_null" }] });
		return result;
	}
}
