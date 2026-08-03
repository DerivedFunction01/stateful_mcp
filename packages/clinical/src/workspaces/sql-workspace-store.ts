import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { WorkspaceAggregateQueryCompiler } from "./workspace-aggregate-query-compiler";
import { createWorkspace } from "./workspace-factory";
import type { WorkspaceStore } from "./workspace-store";
import type {
	CreateWorkspaceRequest,
	WorkspaceAggregate,
} from "./workspace-types";

export class SqlWorkspaceStore implements WorkspaceStore {
	private readonly compiler: WorkspaceAggregateQueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_workspaces",
	) {
		this.compiler = new WorkspaceAggregateQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	async init(request: CreateWorkspaceRequest): Promise<WorkspaceAggregate> {
		const aggregate = createWorkspace(request);
		await this.save(aggregate);
		return aggregate;
	}

	async get(workspaceId: string): Promise<WorkspaceAggregate | null> {
		await this.ready;
		const query = this.compiler.getByIdQuery(workspaceId, this.table);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? this.fromRow(row) : null;
	}

	async list(sessionId: string): Promise<WorkspaceAggregate[]> {
		await this.ready;
		const query = this.compiler.listBySessionQuery(sessionId, this.table);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => this.fromRow(row));
	}

	async save(aggregate: WorkspaceAggregate): Promise<void> {
		await this.ready;
		const query = this.compiler.upsertQuery(
			{
				workspaceId: aggregate.id,
				sessionId: aggregate.sessionId,
				workspaceJson: JSON.stringify(aggregate),
				version: aggregate.version,
				eventHead: aggregate.eventHead,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			this.table,
		);
		await this.executor.exec(query.sql, query.params);
	}

	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table))
			await this.executor.exec(query.sql, query.params);
	}

	private fromRow(row: Record<string, unknown>): WorkspaceAggregate {
		if (typeof row.workspaceJson === "string")
			return JSON.parse(row.workspaceJson) as WorkspaceAggregate;
		return row.workspaceJson as WorkspaceAggregate;
	}
}
