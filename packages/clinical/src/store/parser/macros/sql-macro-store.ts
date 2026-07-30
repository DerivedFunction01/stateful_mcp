import type { SqlExecutor } from "@stateful-mcp/core";
import type { ParserMacro, ParserMacroStore } from "../../interfaces";
import { MacroQueryCompiler } from "../../sql/macro-query-compiler";

export class SqlParserMacroStore implements ParserMacroStore {
	private readonly compiler: MacroQueryCompiler;
	private readonly table: string;

	constructor(
		private readonly executor: SqlExecutor,
		table = "parser_macros",
	) {
		this.compiler = new MacroQueryCompiler();
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(ddl.sql);
		}
	}

	async get(macroName: string): Promise<ParserMacro | null> {
		const { sql, params } = this.compiler.compileGetByMacroNameQuery(
			macroName,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRecord(row) : null;
	}

	async list(): Promise<ParserMacro[]> {
		const { sql, params } = this.compiler.compileListQuery(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	async set(macro: ParserMacro): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.recordToRow(macro),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(macroId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteQuery(
			macroId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private recordToRow(record: ParserMacro): Record<string, unknown> {
		return {
			macroId: record.macroId,
			macroName: record.macroName,
			macroTemplate: record.macroTemplate,
			personnelId: record.personnelId ?? null,
		};
	}

	private rowToRecord(row: Record<string, any>): ParserMacro {
		return {
			macroId: row.macroId as string,
			macroName: row.macroName as string,
			macroTemplate: row.macroTemplate as string,
			personnelId: (row.personnelId as string | undefined) ?? undefined,
		};
	}
}
