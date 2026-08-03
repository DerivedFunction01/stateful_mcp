import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export class SignedNoteQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["noteId"],
			columns: [
				{ name: "noteId", type: "TEXT", nullable: false },
				{ name: "sessionId", type: "TEXT", nullable: false },
				{ name: "patientId", type: "TEXT", nullable: false },
				{ name: "documentVersion", type: "INTEGER", nullable: false },
				{ name: "soapNoteJson", type: "JSON", nullable: false },
				{ name: "events", type: "JSON", nullable: false, default: "[]" },
				{
					name: "workspaceEvents",
					type: "JSON",
					nullable: false,
					default: "[]",
				},
				{ name: "createdAt", type: "TEXT", nullable: false },
				{ name: "signedBy", type: "TEXT", nullable: false },
			],
		});

		const idxPatient = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_patient`,
			columns: ["patientId"],
		});

		const idxSession = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_session`,
			columns: ["sessionId"],
		});

		const idxCreatedAt = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_createdAt`,
			columns: ["createdAt"],
		});

		return [mainDDL, idxPatient, idxSession, idxCreatedAt];
	}

	public compileGetQuery(noteId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "noteId", op: "eq", value: noteId }],
		});
	}

	public compileGetBySessionQuery(
		sessionId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
			limit: 1,
		});
	}

	public compileListByPatientQuery(
		patientId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "patientId", op: "eq", value: patientId }],
			orderBy: [{ column: "createdAt", direction: "DESC" }],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["noteId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}
}
