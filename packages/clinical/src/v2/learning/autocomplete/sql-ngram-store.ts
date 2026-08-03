import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { AutocompleteSuggestionKind } from "../../../store/reference/auto-complete/interfaces";
import { NgramQueryCompiler } from "../../../store/sql/ngram-query-compiler";
import type { NgramStore, NgramSuggestion } from "../interfaces";

const DEFAULT_TABLE = "ngrams";

export class SqlNgramStore implements NgramStore {
	private compiler: NgramQueryCompiler;
	private table: string;
	private executor: SqlExecutor;
	dialect: SqlDialect;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table: string = DEFAULT_TABLE,
	) {
		this.dialect = dialect;
		this.executor = executor;
		this.compiler = new NgramQueryCompiler(dialect);
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddls = this.compiler.getTableDDL(this.table);
		for (const ddl of ddls) {
			await this.executor.exec(ddl.sql, ddl.params);
		}
		const indexes = this.compiler.getIndexDDL(this.table);
		for (const idx of indexes) {
			await this.executor.exec(idx.sql, idx.params);
		}
	}

	async increment(
		ngram: string,
		n: 1 | 2 | 3,
		kind: AutocompleteSuggestionKind,
		ctx?: { templateId?: string; slotName?: string },
	): Promise<void> {
		const { sql, params } = this.compiler.compileIncrementQuery(
			this.table,
			ngram.toLowerCase(),
			n,
			kind,
			ctx?.templateId,
			ctx?.slotName,
		);
		await this.executor.exec(sql, params);
	}

	async suggest(prefix: string, limit = 10): Promise<NgramSuggestion[]> {
		const { sql, params } = this.compiler.compileSuggestQuery(
			this.table,
			prefix.toLowerCase(),
			limit,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => this.rowToSuggestion(row));
	}

	async getTopByKind(
		kind: AutocompleteSuggestionKind,
		limit = 10,
	): Promise<NgramSuggestion[]> {
		const { sql, params } = this.compiler.compileGetTopByKindQuery(
			this.table,
			kind,
			limit,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => this.rowToSuggestion(row));
	}

	private rowToSuggestion(row: Record<string, unknown>): NgramSuggestion {
		return {
			ngram: row.ngram as string,
			n: row.n as 1 | 2 | 3,
			kind: row.kind as AutocompleteSuggestionKind,
			frequency: (row.frequency as number) ?? 1,
			lastUpdatedAt: row.lastUpdatedAt as string,
		};
	}
}
