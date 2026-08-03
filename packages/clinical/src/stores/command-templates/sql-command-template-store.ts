import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { CommandTemplateQueryCompiler } from "../sql/command-template-query-compiler";
import type { CommandTemplate, CommandTemplateStore } from "./interfaces";
import { assertValidCommandTemplate } from "./validation";

export class SqlCommandTemplateStore implements CommandTemplateStore {
	private readonly compiler: CommandTemplateQueryCompiler;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "command_templates",
	) {
		this.compiler = new CommandTemplateQueryCompiler(dialect);
		void this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table))
			await this.executor.exec(query.sql, query.params);
	}

	async getById(templateId: string): Promise<CommandTemplate | null> {
		const query = this.compiler.compileGetQuery(templateId, this.table);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? this.rowToTemplate(row) : null;
	}

	async list(context?: {
		macroId?: string;
		workspaceId?: string;
		specialtyId?: string;
		stage?: CommandTemplate["stage"];
	}): Promise<CommandTemplate[]> {
		const where = [
			context?.macroId
				? { column: "macroId", op: "eq" as const, value: context.macroId }
				: undefined,
			context?.workspaceId
				? {
						column: "workspaceId",
						op: "eq" as const,
						value: context.workspaceId,
					}
				: undefined,
			context?.specialtyId
				? {
						column: "specialtyId",
						op: "eq" as const,
						value: context.specialtyId,
					}
				: undefined,
			context?.stage
				? { column: "stage", op: "eq" as const, value: context.stage }
				: undefined,
			{ column: "active", op: "eq" as const, value: 1 },
		].filter(Boolean) as { column: string; op: "eq"; value: unknown }[];
		const query = this.compiler.compileListQuery(this.table, where);
		return (await this.executor.query(query.sql, query.params)).map((row) =>
			this.rowToTemplate(row),
		);
	}

	async set(template: CommandTemplate): Promise<void> {
		assertValidCommandTemplate(template);
		const query = this.compiler.compileUpsertQuery(
			{
				templateId: template.templateId,
				templateName: template.templateName ?? null,
				stage: template.stage,
				macroId: template.macroId ?? null,
				workspaceId: template.workspaceId ?? null,
				specialtyId: template.specialtyId ?? null,
				active: template.active === false ? 0 : 1,
				templateText: template.templateText,
				slotsBlob: JSON.stringify(template.slots),
				parentTemplateId: template.parentTemplateId ?? null,
			},
			this.table,
		);
		await this.executor.exec(query.sql, query.params);
	}

	async delete(templateId: string): Promise<void> {
		const query = this.compiler.compileDeleteQuery(templateId, this.table);
		await this.executor.exec(query.sql, query.params);
	}

	private rowToTemplate(row: Record<string, any>): CommandTemplate {
		return {
			templateId: String(row.templateId),
			templateName: row.templateName ?? undefined,
			stage: row.stage,
			macroId: row.macroId ?? undefined,
			workspaceId: row.workspaceId ?? undefined,
			specialtyId: row.specialtyId ?? undefined,
			active: row.active !== 0,
			templateText: String(row.templateText),
			slots: JSON.parse(row.slotsBlob || "{}"),
			parentTemplateId: row.parentTemplateId ?? undefined,
		};
	}
}
