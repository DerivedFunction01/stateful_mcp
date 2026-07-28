import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type {
	SharedFieldAnchorRule,
	SharedFieldAnchorStore,
} from "../../../parser/field-shared/shared-field-anchor";
import { AnchorQueryCompiler } from "../../sql/anchor-query-compiler";

export class SqlSharedFieldAnchorStore implements SharedFieldAnchorStore {
	private readonly compiler: AnchorQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "shared_field_anchors",
	) {
		this.compiler = new AnchorQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(ddl.sql);
		}
		const indexes = this.compiler.getIndexDDL(this.table);
		for (const idx of indexes) {
			await this.executor.exec(idx.sql, idx.params);
		}
	}

	async get(ruleId: string): Promise<SharedFieldAnchorRule | null> {
		const { sql, params } = this.compiler.compileGetQuery(ruleId, this.table);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRule(row) : null;
	}

	async listBySchema(targetSchema: string): Promise<SharedFieldAnchorRule[]> {
		const { sql, params } = this.compiler.compileListBySchemaQuery(
			targetSchema,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRule(r));
	}

	async listForContext(context: {
		workspaceId?: string;
		personnelId?: string;
	}): Promise<SharedFieldAnchorRule[]> {
		const conditions: any[] = [];
		if (context.workspaceId !== undefined) {
			conditions.push({
				column: "workspaceId",
				op: "eq",
				value: context.workspaceId,
			});
		}
		if (context.personnelId !== undefined) {
			conditions.push({
				column: "personnelId",
				op: "eq",
				value: context.personnelId,
			});
		}
		const { sql, params } = this.compiler.compileListQuery(
			this.table,
			conditions,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRule(r));
	}

	async set(rule: SharedFieldAnchorRule): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.ruleToRow(rule),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(ruleId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteQuery(
			ruleId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private ruleToRow(rule: SharedFieldAnchorRule): Record<string, unknown> {
		return {
			ruleId: rule.ruleId,
			targetSchema: rule.targetSchema,
			workspaceId: rule.workspaceId ?? null,
			personnelId: rule.personnelId ?? null,
			anchors: JSON.stringify(rule.anchors),
		};
	}

	private rowToRule(row: Record<string, any>): SharedFieldAnchorRule {
		return {
			ruleId: row.ruleId as string,
			targetSchema: row.targetSchema as string,
			workspaceId: row.workspaceId ? (row.workspaceId as string) : undefined,
			personnelId: row.personnelId ? (row.personnelId as string) : undefined,
			anchors:
				typeof row.anchors === "string" ? JSON.parse(row.anchors) : row.anchors,
		};
	}
}
