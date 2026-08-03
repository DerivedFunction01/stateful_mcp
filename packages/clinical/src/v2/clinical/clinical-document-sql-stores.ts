import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { type CompiledQuery, QueryCompiler } from "@stateful-mcp/core";
import type {
	ClinicalDocumentProjectionStore,
	ClinicalDocumentReadModel,
	SignedDocumentArchive,
	SignedDocumentRecord,
} from "./clinical-document-types";

class ClinicalDocumentQueryCompiler {
	private readonly compiler: QueryCompiler;
	constructor(dialect: SqlDialect) {
		this.compiler = new QueryCompiler(dialect);
	}
	projectionDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["documentId"],
				columns: [
					{ name: "documentId", type: "TEXT", nullable: false },
					{ name: "sessionId", type: "TEXT", nullable: false },
					{ name: "patientId", type: "TEXT", nullable: false },
					{ name: "documentJson", type: "TEXT", nullable: false },
					{ name: "version", type: "INTEGER", nullable: false },
					{ name: "eventHead", type: "TEXT", nullable: true },
				],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_session`,
				columns: ["sessionId"],
			}),
		];
	}
	archiveDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["documentId"],
				columns: [
					{ name: "documentId", type: "TEXT", nullable: false },
					{ name: "sessionId", type: "TEXT", nullable: false },
					{ name: "patientId", type: "TEXT", nullable: false },
					{ name: "recordJson", type: "TEXT", nullable: false },
				],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_patient`,
				columns: ["patientId"],
			}),
		];
	}
	byId(id: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "documentId", op: "eq", value: id }],
		});
	}
	bySession(sessionId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
	}
	byPatient(patientId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "patientId", op: "eq", value: patientId }],
		});
	}
	upsert(row: Record<string, unknown>, table: string): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns: undefined,
		});
	}
}

export class SqlClinicalDocumentProjectionStore
	implements ClinicalDocumentProjectionStore
{
	private readonly compiler: ClinicalDocumentQueryCompiler;
	private readonly ready: Promise<void>;
	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_clinical_documents",
	) {
		this.compiler = new ClinicalDocumentQueryCompiler(dialect);
		this.ready = this.init();
	}
	async get(documentId: string): Promise<ClinicalDocumentReadModel | null> {
		await this.ready;
		const q = this.compiler.byId(documentId, this.table);
		const row = await this.executor.queryOne(q.sql, q.params);
		return row ? this.parse(row.documentJson) : null;
	}
	async list(sessionId: string): Promise<ClinicalDocumentReadModel[]> {
		await this.ready;
		const q = this.compiler.bySession(sessionId, this.table);
		const rows = await this.executor.query(q.sql, q.params);
		return rows.map((row) => this.parse(row.documentJson));
	}
	async save(document: ClinicalDocumentReadModel): Promise<void> {
		await this.ready;
		const q = this.compiler.upsert(
			{
				documentId: document.documentId,
				sessionId: document.sessionId,
				patientId: document.patientId,
				documentJson: JSON.stringify(document),
				version: document.version,
				eventHead: document.eventHead,
			},
			this.table,
		);
		await this.executor.exec(q.sql, q.params);
	}
	private async init(): Promise<void> {
		for (const q of this.compiler.projectionDDL(this.table))
			await this.executor.exec(q.sql, q.params);
	}
	private parse(value: unknown): ClinicalDocumentReadModel {
		return typeof value === "string"
			? (JSON.parse(value) as ClinicalDocumentReadModel)
			: (value as ClinicalDocumentReadModel);
	}
}

export class SqlSignedDocumentArchive implements SignedDocumentArchive {
	private readonly compiler: ClinicalDocumentQueryCompiler;
	private readonly ready: Promise<void>;
	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_signed_documents",
	) {
		this.compiler = new ClinicalDocumentQueryCompiler(dialect);
		this.ready = this.init();
	}
	async archive(record: SignedDocumentRecord): Promise<void> {
		await this.ready;
		const q = this.compiler.upsert(
			{
				documentId: record.documentId,
				sessionId: record.sessionId,
				patientId: record.patientId,
				recordJson: JSON.stringify(record),
			},
			this.table,
		);
		await this.executor.exec(q.sql, q.params);
	}
	async get(documentId: string): Promise<SignedDocumentRecord | null> {
		await this.ready;
		const q = this.compiler.byId(documentId, this.table);
		const row = await this.executor.queryOne(q.sql, q.params);
		return row ? this.parse(row.recordJson) : null;
	}
	async getBySession(sessionId: string): Promise<SignedDocumentRecord | null> {
		await this.ready;
		const q = this.compiler.bySession(sessionId, this.table);
		const row = await this.executor.queryOne(q.sql, q.params);
		return row ? this.parse(row.recordJson) : null;
	}
	async listForPatient(patientId: string): Promise<SignedDocumentRecord[]> {
		await this.ready;
		const q = this.compiler.byPatient(patientId, this.table);
		const rows = await this.executor.query(q.sql, q.params);
		return rows.map((row) => this.parse(row.recordJson));
	}
	private async init(): Promise<void> {
		for (const q of this.compiler.archiveDDL(this.table))
			await this.executor.exec(q.sql, q.params);
	}
	private parse(value: unknown): SignedDocumentRecord {
		return typeof value === "string"
			? (JSON.parse(value) as SignedDocumentRecord)
			: (value as SignedDocumentRecord);
	}
}
