import { QueryCompiler, type SqlDialect, type SqlExecutor } from "@stateful-mcp/core";
import type { SetupSourceDocument } from "./setup-types";
import type { SetupSourceStore } from "./setup-store";

export class SqlSetupSourceStore implements SetupSourceStore {
	private readonly compiler: QueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "clinical_setup_sources",
	) {
		this.compiler = new QueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	async get(sourceId: string): Promise<SetupSourceDocument | null> {
		await this.ready;
		const query = this.compiler.compileSelect({
			table: this.table,
			where: [{ column: "source_id", op: "eq", value: sourceId }],
		});
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? JSON.parse(String(row.payload)) as SetupSourceDocument : null;
	}

	async set(source: SetupSourceDocument): Promise<void> {
		await this.ready;
		const query = this.compiler.compileInsert({
			table: this.table,
			values: {
				source_id: source.sourceId,
				profile_id: source.profileId,
				version: source.profileVersion,
				updated_at: source.updatedAt,
				payload: JSON.stringify(source),
			},
			onConflict: "replace",
			conflictColumns: ["source_id"],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async delete(sourceId: string): Promise<void> {
		await this.ready;
		const query = this.compiler.compileDelete({
			table: this.table,
			where: [{ column: "source_id", op: "eq", value: sourceId }],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async list(): Promise<SetupSourceDocument[]> {
		await this.ready;
		const query = this.compiler.compileSelect({
			table: this.table,
			orderBy: [{ column: "source_id", direction: "ASC" }],
		});
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => JSON.parse(String(row.payload)) as SetupSourceDocument);
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.compileCreateTable({
			table: this.table,
			ifNotExists: true,
			primaryKey: ["source_id"],
			columns: [
				{ name: "source_id", type: "text", nullable: false },
				{ name: "profile_id", type: "text", nullable: false },
				{ name: "version", type: "integer", nullable: false },
				{ name: "updated_at", type: "text", nullable: false },
				{ name: "payload", type: "text", nullable: false },
			],
		});
		await this.executor.exec(ddl.sql, ddl.params);
	}
}
