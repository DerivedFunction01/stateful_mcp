import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ConceptDefaultQueryCompiler } from "../../sql/concept-default-query-compiler";
import type { ParserConceptDefault } from "../interfaces";
import type { ParserConceptDefaultStore } from "./interfaces";

export class SqlConceptDefaultStore implements ParserConceptDefaultStore {
	private readonly compiler: ConceptDefaultQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "parser_concept_defaults",
	) {
		this.compiler = new ConceptDefaultQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(ddl.sql);
		}
	}

	async get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null> {
		const { sql, params } = this.compiler.compileGetQuery(
			anchorConceptId,
			targetSchema,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRecord(row) : null;
	}

	async list(): Promise<ParserConceptDefault[]> {
		const { sql, params } = this.compiler.compileListQuery(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	async listBySchema(targetSchema: string): Promise<ParserConceptDefault[]> {
		const { sql, params } = this.compiler.compileListBySchemaQuery(
			targetSchema,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	async set(record: ParserConceptDefault): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.recordToRow(record),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(anchorConceptId: string, targetSchema: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteQuery(
			anchorConceptId,
			targetSchema,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private recordToRow(record: ParserConceptDefault): Record<string, unknown> {
		return {
			anchorConceptId: record.anchorConceptId,
			targetSchema: record.targetSchema,
			regexPatterns: JSON.stringify(record.regexPatterns),
			defaultProperties: JSON.stringify(record.defaultProperties),
		};
	}

	private rowToRecord(row: Record<string, any>): ParserConceptDefault {
		return {
			anchorConceptId: row.anchorConceptId as string,
			targetSchema: row.targetSchema as string,
			regexPatterns: (row.regexPatterns as string[]) || [],
			defaultProperties: (row.defaultProperties as Record<string, any>) || {},
		};
	}
}
