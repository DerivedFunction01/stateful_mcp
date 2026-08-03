import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";
import type { V2NotebookSessionRecord } from "./notebook-session-store";

export class NotebookSessionQueryCompiler {
	private readonly compiler: QueryCompiler;
	constructor(dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["sessionId"],
				columns: [
					{ name: "sessionId", type: "TEXT", nullable: false },
					{ name: "revision", type: "INTEGER", nullable: false },
					{ name: "updatedAt", type: "TEXT", nullable: false },
					{ name: "sessionJson", type: "json", nullable: false },
				],
			}),
		];
	}
	getQuery(sessionId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
			limit: 1,
		});
	}
	listQuery(table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			orderBy: [{ column: "updatedAt", direction: "DESC" }],
		});
	}
	upsertQuery(record: V2NotebookSessionRecord, table: string): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: {
				sessionId: record.sessionId,
				revision: record.revision,
				updatedAt: record.updatedAt,
				sessionJson: JSON.stringify(record),
			},
			onConflict: "replace",
		});
	}
	deleteQuery(sessionId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
	}
}
