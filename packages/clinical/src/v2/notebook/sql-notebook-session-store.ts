import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { NotebookSessionQueryCompiler } from "./notebook-session-query-compiler";
import type {
	V2NotebookSessionRecord,
	V2NotebookSessionStore,
} from "./notebook-session-store";

export class SqlNotebookSessionStore implements V2NotebookSessionStore {
	private readonly compiler: NotebookSessionQueryCompiler;
	private readonly ready: Promise<void>;
	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_notebook_sessions",
	) {
		this.compiler = new NotebookSessionQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}
	async get(sessionId: string): Promise<V2NotebookSessionRecord | null> {
		await this.ready;
		const query = this.compiler.getQuery(sessionId, this.table);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? parse(row.sessionJson) : null;
	}
	async list(): Promise<V2NotebookSessionRecord[]> {
		await this.ready;
		const query = this.compiler.listQuery(this.table);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => parse(row.sessionJson));
	}
	async save(
		record: V2NotebookSessionRecord,
		expectedRevision?: number,
	): Promise<void> {
		await this.ready;
		const existing = await this.get(record.sessionId);
		if (
			expectedRevision !== undefined &&
			existing?.revision !== expectedRevision
		)
			throw new Error(
				`Notebook session '${record.sessionId}' revision mismatch`,
			);
		const query = this.compiler.upsertQuery(record, this.table);
		await this.executor.exec(query.sql, query.params);
	}
	async delete(sessionId: string): Promise<void> {
		await this.ready;
		const query = this.compiler.deleteQuery(sessionId, this.table);
		await this.executor.exec(query.sql, query.params);
	}
	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table))
			await this.executor.exec(query.sql, query.params);
	}
}

function parse(value: unknown): V2NotebookSessionRecord {
	return typeof value === "string"
		? (JSON.parse(value) as V2NotebookSessionRecord)
		: (value as V2NotebookSessionRecord);
}
