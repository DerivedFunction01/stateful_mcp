import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ReferenceQueryCompiler } from "../sql/reference-query-compiler";
import type { StopWordWordListStore } from "./word-list-store-interfaces";

export class SqlStopWordWordListStore implements StopWordWordListStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "stop_word_word_lists",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getStopWordWordListsTableDDL(this.table);
		await this.executor.exec(ddl.sql);
	}

	async get(id: string): Promise<string[] | null> {
		const { sql, params } = this.compiler.compileGetStopWordWordList(
			id,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		if (!row) return null;
		const raw = row.words;
		if (Array.isArray(raw)) return raw;
		if (typeof raw === "string") {
			try {
				return JSON.parse(raw);
			} catch {
				return null;
			}
		}
		return null;
	}

	async list(): Promise<Array<{ id: string; words: string[] }>> {
		const { sql, params } = this.compiler.compileListStopWordWordLists(
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => {
			const raw = r.words;
			let words: string[] = [];
			if (Array.isArray(raw)) {
				words = raw;
			} else if (typeof raw === "string") {
				try {
					words = JSON.parse(raw);
				} catch {
					// leave empty
				}
			}
			return { id: r.id as string, words };
		});
	}

	async set(id: string, words: string[]): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertStopWordWordList(
			{ id, words: JSON.stringify(words) },
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(id: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteStopWordWordList(
			id,
			this.table,
		);
		await this.executor.exec(sql, params);
	}
}
