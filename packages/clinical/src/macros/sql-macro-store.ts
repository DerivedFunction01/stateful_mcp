import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { MacroStore, MacroDefinition } from "./macro-definition";
import { MacroQueryCompiler } from "./macro-query-compiler";

export class SqlMacroStore implements MacroStore {
	private readonly compiler: MacroQueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_macros",
	) {
		this.compiler = new MacroQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	async get(
		macroName: string,
		context?: { personnelId?: string; profileId?: string },
	): Promise<MacroDefinition | null> {
		await this.ready;
		const query = this.compiler.getQuery(macroName, this.table, context);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? parse(row.definition) : null;
	}

	async list(context?: {
		personnelId?: string;
		profileId?: string;
	}): Promise<MacroDefinition[]> {
		await this.ready;
		const query = this.compiler.listQuery(this.table, context);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => parse(row.definition));
	}

	async set(macro: MacroDefinition): Promise<void> {
		await this.ready;
		const query = this.compiler.upsertQuery(
			{
				macroId: macro.macroId,
				macroName: macro.macroName,
				version: macro.version,
				active: macro.active ? 1 : 0,
				status: macro.status,
				personnelId: macro.personnelId ?? null,
				profileId: macro.profileId ?? null,
				definition: JSON.stringify(macro),
			},
			this.table,
		);
		await this.executor.exec(query.sql, query.params);
	}

	async delete(macroId: string): Promise<void> {
		await this.ready;
		const query = this.compiler.deleteQuery(macroId, this.table);
		await this.executor.exec(query.sql, query.params);
	}

	private async ensureTable(): Promise<void> {
		for (const query of [
			...this.compiler.getTableDDL(this.table),
			...this.compiler.getIndexDDL(this.table),
		])
			await this.executor.exec(query.sql, query.params);
	}
}

function parse(value: unknown): MacroDefinition {
	return typeof value === "string"
		? (JSON.parse(value) as MacroDefinition)
		: (value as MacroDefinition);
}
