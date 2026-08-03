import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ClinicalProseTemplate } from "../../parser/interfaces";
import { ReferenceQueryCompiler } from "../../../store/sql/reference-query-compiler";
import type { Position } from "../auto-complete/interfaces";
import type { ClinicalProseTemplateStore } from "./interfaces";

export class SqlClinicalProseTemplateStore
	implements ClinicalProseTemplateStore
{
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "clinical_prose_templates",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getClinicalProseTemplatesTableDDL(
			this.table,
		)) {
			await this.executor.exec(ddl.sql);
		}
	}

	async get(
		schema: string,
		position: Position,
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null> {
		const { sql, params } = this.compiler.compileGetClinicalProseTemplate(
			schema,
			position,
			conceptId,
			workspaceId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToTemplate(row) : null;
	}

	async getById(templateId: string): Promise<ClinicalProseTemplate | null> {
		const { sql, params } = this.compiler.compileGetClinicalProseTemplateById(
			templateId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToTemplate(row) : null;
	}

	async listBySchema(
		schema: string,
		position?: Position,
	): Promise<ClinicalProseTemplate[]> {
		const { sql, params } =
			this.compiler.compileListClinicalProseTemplatesBySchema(
				schema,
				position,
				this.table,
			);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToTemplate(r));
	}

	async list(): Promise<ClinicalProseTemplate[]> {
		const { sql, params } = this.compiler.compileListClinicalProseTemplates(
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToTemplate(r));
	}

	async set(template: ClinicalProseTemplate): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertClinicalProseTemplate(
			this.templateToRow(template),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(templateId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteClinicalProseTemplate(
			templateId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private templateToRow(
		template: ClinicalProseTemplate,
	): Record<string, unknown> {
		return {
			templateId: template.templateId,
			parentTemplateId: template.parentTemplateId ?? null,
			targetSchema: template.targetSchema,
			targetConceptId: template.targetConceptId ?? null,
			workspaceId: template.workspaceId ?? null,
			specialtyId: template.specialtyId ?? null,
			slotPosition: template.slotPosition,
			templateText: template.templateText,
			slotsBlob: JSON.stringify(template.slots || {}),
			source: "local",
		};
	}

	private rowToTemplate(row: Record<string, any>): ClinicalProseTemplate {
		const t: ClinicalProseTemplate = {
			templateId: row.templateId as string,
			targetSchema: row.targetSchema as string,
			slotPosition: row.slotPosition as Position,
			templateText: row.templateText as string,
			slots: JSON.parse(row.slotsBlob || "{}"),
		};
		if (row.parentTemplateId != null)
			t.parentTemplateId = row.parentTemplateId as string;
		if (row.targetConceptId != null)
			t.targetConceptId = row.targetConceptId as string;
		if (row.workspaceId != null) t.workspaceId = row.workspaceId as string;
		if (row.specialtyId != null) t.specialtyId = row.specialtyId as string;
		return t;
	}
}
