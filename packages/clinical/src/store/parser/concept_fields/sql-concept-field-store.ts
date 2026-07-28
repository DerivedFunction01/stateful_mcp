import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ConceptFieldQueryCompiler } from "../../sql/concept-field-query-compiler";
import type { ConceptFieldRule, ConceptFieldStore } from "./interfaces";

export class SqlConceptFieldStore implements ConceptFieldStore {
	private readonly compiler: ConceptFieldQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "concept_fields",
	) {
		this.compiler = new ConceptFieldQueryCompiler(dialect);
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
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): Promise<ConceptFieldRule | null> {
		const { sql, params } = this.compiler.compileGetQuery(
			conceptId,
			targetSchema,
			fieldPath,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRecord(row) : null;
	}

	async list(): Promise<ConceptFieldRule[]> {
		const { sql, params } = this.compiler.compileListQuery(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	async listBySchema(targetSchema: string): Promise<ConceptFieldRule[]> {
		const { sql, params } = this.compiler.compileListBySchemaQuery(
			targetSchema,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	async listByConcept(conceptId: string): Promise<ConceptFieldRule[]> {
		const { sql, params } = this.compiler.compileListByConceptQuery(
			conceptId,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	async set(rule: ConceptFieldRule): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.recordToRow(rule),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteQuery(
			conceptId,
			targetSchema,
			fieldPath,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private recordToRow(record: ConceptFieldRule): Record<string, unknown> {
		return {
			conceptId: record.conceptId,
			targetSchema: record.targetSchema,
			fieldPath: record.fieldPath,
			ruleId: record.ruleId,
		};
	}

	private rowToRecord(row: Record<string, any>): ConceptFieldRule {
		return {
			ruleId: row.ruleId as string,
			conceptId: row.conceptId as string,
			targetSchema: row.targetSchema as string,
			fieldPath: row.fieldPath as string,
		};
	}
}
