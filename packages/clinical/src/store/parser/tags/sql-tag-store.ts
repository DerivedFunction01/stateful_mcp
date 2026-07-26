import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ReferenceQueryCompiler } from "../../sql/reference-query-compiler";
import type { TagRecord, TagStore } from "./interfaces";

export class SqlTagStore implements TagStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(dialect: SqlDialect, executor: SqlExecutor, table = "tags") {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getTagsTableDDL(this.table);
		await this.executor.exec(ddl.sql);
	}

	async get(tagId: string): Promise<TagRecord | null> {
		const { sql, params } = this.compiler.compileGetTag(tagId, this.table);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToTag(row) : null;
	}

	async list(): Promise<TagRecord[]> {
		const { sql, params } = this.compiler.compileListTags(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToTag(r));
	}

	async set(record: TagRecord): Promise<void> {
		const row = {
			tagId: record.tagId,
			tagName: record.tagName,
			tagBlob: JSON.stringify(
				typeof record.tagBlob === "string"
					? record.tagBlob
					: JSON.stringify(record.tagBlob),
			),
			source: record.source || "local",
		};
		const { sql, params } = this.compiler.compileUpsertTag(row, this.table);
		await this.executor.exec(sql, params);
	}

	async delete(tagId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteTag(tagId, this.table);
		await this.executor.exec(sql, params);
	}

	private rowToTag(row: Record<string, any>): TagRecord {
		return {
			tagId: row.tagId as string,
			tagName: row.tagName as string,
			tagBlob:
				typeof row.tagBlob === "object"
					? JSON.stringify(row.tagBlob)
					: (row.tagBlob as string),
			source: row.source as string,
		};
	}
}

export type { TagRecord };
