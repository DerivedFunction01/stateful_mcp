import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ParserCommandMacro, ParserCommandMacroStore } from "./interfaces";
import { normalizeParserCommandMacro } from "./validation";
import { CommandMacroQueryCompiler } from "../../sql/command-macro-query-compiler";

export class SqlParserCommandMacroStore implements ParserCommandMacroStore {
	private readonly compiler: CommandMacroQueryCompiler;
	private readonly table: string;

	constructor(dialect: SqlDialect, private readonly executor: SqlExecutor, table = "parser_command_macros") {
		this.compiler = new CommandMacroQueryCompiler(dialect);
		this.table = table;
		void this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getTableDDL(this.table)) await this.executor.exec(ddl.sql, ddl.params);
		for (const index of this.compiler.getIndexDDL(this.table)) await this.executor.exec(index.sql, index.params);
	}

	async get(macroName: string, context?: { personnelId?: string; profileId?: string }): Promise<ParserCommandMacro | null> {
		const query = this.compiler.compileGetQuery(macroName, this.table, context);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? this.parse(row.definition) : null;
	}

	async list(context?: { personnelId?: string; profileId?: string }): Promise<ParserCommandMacro[]> {
		const query = this.compiler.compileListQuery(this.table, context);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => this.parse(row.definition));
	}

	async set(macro: ParserCommandMacro): Promise<void> {
		const value = normalizeParserCommandMacro(macro);
		const query = this.compiler.compileUpsertQuery({ macroId: value.macroId, macroName: value.macroName, version: value.version, active: value.active ? 1 : 0, personnelId: value.personnelId ?? null, profileId: value.profileId ?? null, definition: JSON.stringify(value) }, this.table);
		await this.executor.exec(query.sql, query.params);
	}

	async delete(macroId: string): Promise<void> {
		const query = this.compiler.compileDeleteQuery(macroId, this.table);
		await this.executor.exec(query.sql, query.params);
	}

	private parse(value: unknown): ParserCommandMacro {
		return normalizeParserCommandMacro(typeof value === "string" ? JSON.parse(value) : value as ParserCommandMacro);
	}
}
