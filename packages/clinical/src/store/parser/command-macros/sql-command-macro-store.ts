import type { SqlExecutor } from "@stateful-mcp/core";
import type { ParserCommandMacro, ParserCommandMacroStore } from "./interfaces";
import { normalizeParserCommandMacro } from "./validation";

export class SqlParserCommandMacroStore implements ParserCommandMacroStore {
	private readonly table: string;

	constructor(private readonly executor: SqlExecutor, table = "parser_command_macros") {
		this.table = table;
		void this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		await this.executor.exec(`CREATE TABLE IF NOT EXISTS ${this.table} (macroId TEXT PRIMARY KEY, macroName TEXT NOT NULL, version INTEGER NOT NULL, active INTEGER NOT NULL, personnelId TEXT, profileId TEXT, definition TEXT NOT NULL, UNIQUE(macroName, version))`);
		await this.executor.exec(`CREATE INDEX IF NOT EXISTS idx_${this.table}_name ON ${this.table}(macroName, active)`);
	}

	async get(macroName: string, context?: { personnelId?: string; profileId?: string }): Promise<ParserCommandMacro | null> {
		const params: unknown[] = [macroName];
		let sql = `SELECT definition FROM ${this.table} WHERE macroName = ? AND active = 1`;
		if (context?.personnelId) { sql += " AND (personnelId IS NULL OR personnelId = ?)"; params.push(context.personnelId); }
		if (context?.profileId) { sql += " AND (profileId IS NULL OR profileId = ?)"; params.push(context.profileId); }
		sql += " ORDER BY version DESC LIMIT 1";
		const row = await this.executor.queryOne(sql, params);
		return row ? this.parse(row.definition) : null;
	}

	async list(context?: { personnelId?: string; profileId?: string }): Promise<ParserCommandMacro[]> {
		const params: unknown[] = [];
		let sql = `SELECT definition FROM ${this.table} WHERE active = 1`;
		if (context?.personnelId) { sql += " AND (personnelId IS NULL OR personnelId = ?)"; params.push(context.personnelId); }
		if (context?.profileId) { sql += " AND (profileId IS NULL OR profileId = ?)"; params.push(context.profileId); }
		sql += " ORDER BY macroName ASC, version DESC";
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => this.parse(row.definition));
	}

	async set(macro: ParserCommandMacro): Promise<void> {
		const value = normalizeParserCommandMacro(macro);
		await this.executor.exec(`INSERT INTO ${this.table} (macroId, macroName, version, active, personnelId, profileId, definition) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(macroId) DO UPDATE SET macroName=excluded.macroName, version=excluded.version, active=excluded.active, personnelId=excluded.personnelId, profileId=excluded.profileId, definition=excluded.definition`, [value.macroId, value.macroName, value.version, value.active ? 1 : 0, value.personnelId ?? null, value.profileId ?? null, JSON.stringify(value)]);
	}

	async delete(macroId: string): Promise<void> {
		await this.executor.exec(`DELETE FROM ${this.table} WHERE macroId = ?`, [macroId]);
	}

	private parse(value: unknown): ParserCommandMacro {
		return normalizeParserCommandMacro(typeof value === "string" ? JSON.parse(value) : value as ParserCommandMacro);
	}
}
