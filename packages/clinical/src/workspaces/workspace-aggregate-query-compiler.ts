import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export interface WorkspaceAggregateRow {
	workspaceId: string;
	sessionId: string;
	workspaceJson: string;
	version: number;
	eventHead?: string;
	createdAt: string;
	updatedAt: string;
}

export class WorkspaceAggregateQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["workspaceId"],
				columns: [
					{ name: "workspaceId", type: "TEXT", nullable: false },
					{ name: "sessionId", type: "TEXT", nullable: false },
					{ name: "workspaceJson", type: "json", nullable: false },
					{ name: "version", type: "INTEGER", nullable: false },
					{ name: "eventHead", type: "TEXT", nullable: true },
					{ name: "createdAt", type: "TEXT", nullable: false },
					{ name: "updatedAt", type: "TEXT", nullable: false },
				],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_session`,
				columns: ["sessionId"],
			}),
		];
	}

	getByIdQuery(workspaceId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "workspaceId", op: "eq", value: workspaceId }],
		});
	}

	listBySessionQuery(sessionId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
			orderBy: [{ column: "updatedAt", direction: "ASC" }],
		});
	}

	upsertQuery(row: WorkspaceAggregateRow, table: string): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns: undefined,
		});
	}
}
