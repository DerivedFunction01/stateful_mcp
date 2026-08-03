import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { SignedSoapNoteRecord, SignedSoapNoteStore } from "../interfaces";
import { SignedNoteQueryCompiler } from "../sql/signed-note-query-compiler";

export class SqlSignedSoapNoteStore implements SignedSoapNoteStore {
	private readonly compiler: SignedNoteQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "signed_soap_notes",
	) {
		this.compiler = new SignedNoteQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getTableDDL(this.table);
		for (const stmt of ddl) {
			await this.executor.exec(stmt.sql, stmt.params);
		}
	}

	async archive(
		record: Omit<SignedSoapNoteRecord, "createdAt">,
	): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.recordToRow(record),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async get(noteId: string): Promise<SignedSoapNoteRecord | null> {
		const { sql, params } = this.compiler.compileGetQuery(noteId, this.table);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRecord(row) : null;
	}

	async getBySession(sessionId: string): Promise<SignedSoapNoteRecord | null> {
		const { sql, params } = this.compiler.compileGetBySessionQuery(
			sessionId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRecord(row) : null;
	}

	async listForPatient(patientId: string): Promise<SignedSoapNoteRecord[]> {
		const { sql, params } = this.compiler.compileListByPatientQuery(
			patientId,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRecord(r));
	}

	private recordToRow(
		record: Partial<SignedSoapNoteRecord>,
	): Record<string, unknown> {
		return {
			noteId: record.noteId,
			sessionId: record.sessionId,
			patientId: record.patientId,
			documentVersion: record.documentVersion,
			soapNoteJson: JSON.stringify(record.soapNoteJson),
			events: JSON.stringify(record.events || []),
			workspaceEvents: JSON.stringify(record.workspaceEvents || []),
			createdAt: record.createdAt,
			signedBy: record.signedBy,
		};
	}

	private rowToRecord(row: Record<string, any>): SignedSoapNoteRecord {
		return {
			noteId: row.noteId as string,
			sessionId: row.sessionId as string,
			patientId: row.patientId as string,
			documentVersion: row.documentVersion as number,
			soapNoteJson: JSON.parse(row.soapNoteJson as string),
			events: JSON.parse(row.events as string),
			workspaceEvents: JSON.parse(row.workspaceEvents as string),
			createdAt: row.createdAt as string,
			signedBy: row.signedBy as string,
		};
	}
}
