import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

/**
 * SQL query compiler for the durable notebook document store.
 *
 * Two tables:
 *   - `sessionsTable` (default `notebook_sessions`; sessionId PK, activeIndex INT,
 *     draftText TEXT, updatedAt TEXT)
 *   - `cellsTable` (default `notebook_cells`; sessionId, cellId, position INT,
 *     cellJson JSON) with a `(sessionId, position)` composite ordering and an
 *     index on sessionId.
 */
export class NotebookQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;
	private readonly sessionsTable: string;
	private readonly cellsTable: string;

	constructor(
		dialect: SqlDialect = "sqlite",
		sessionsTable = "notebook_sessions",
		cellsTable = "notebook_cells",
	) {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
		this.sessionsTable = sessionsTable;
		this.cellsTable = cellsTable;
	}

	public getTableDDL(): CompiledQuery[] {
		const sessionsTable = this.compiler.compileCreateTable({
			table: this.sessionsTable,
			ifNotExists: true,
			primaryKey: ["sessionId"],
			columns: [
				{ name: "sessionId", type: "TEXT", nullable: false },
				{ name: "activeIndex", type: "int", nullable: false },
				{ name: "draftText", type: "TEXT", nullable: false },
				{ name: "collectionsJson", type: "JSON", nullable: false },
				{ name: "updatedAt", type: "TEXT", nullable: false },
			],
		});

		const cellsTable = this.compiler.compileCreateTable({
			table: this.cellsTable,
			ifNotExists: true,
			primaryKey: ["sessionId", "cellId"],
			columns: [
				{ name: "sessionId", type: "TEXT", nullable: false },
				{ name: "cellId", type: "TEXT", nullable: false },
				{ name: "position", type: "int", nullable: false },
				{ name: "cellJson", type: "JSON", nullable: false },
			],
		});

		const idxCellsSession = this.compiler.compileCreateIndex({
			table: this.cellsTable,
			name: `idx_${this.cellsTable}_session`,
			columns: ["sessionId"],
		});

		return [sessionsTable, cellsTable, idxCellsSession];
	}

	public compileGetSessionQuery(sessionId: string): CompiledQuery {
		return this.compiler.compileSelect({
			table: this.sessionsTable,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
	}

	public compileGetCellsQuery(sessionId: string): CompiledQuery {
		return this.compiler.compileSelect({
			table: this.cellsTable,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
			orderBy: [{ column: "position", direction: "ASC" }],
		});
	}

	public compileGetSessionIdsQuery(): CompiledQuery {
		return this.compiler.compileSelect({
			table: this.sessionsTable,
			select: [{ column: "sessionId" }],
		});
	}

	public compileUpsertSessionQuery(
		row: Record<string, unknown>,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["sessionId"];
		return this.compiler.compileInsert({
			table: this.sessionsTable,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileInsertCellQuery(row: Record<string, unknown>): CompiledQuery {
		return this.compiler.compileInsert({
			table: this.cellsTable,
			values: row,
			onConflict: "replace",
		});
	}

	public compileDeleteCellsQuery(sessionId: string): CompiledQuery {
		return this.compiler.compileDelete({
			table: this.cellsTable,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
	}
}
