import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ClinicalProseTemplate } from "../../rendering/template-types";
import { ReferenceQueryCompiler } from "../sql/reference-query-compiler";
import type {
	ClinicalProseTemplateStore,
	ProseTemplateListContext,
} from "./interfaces";

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
		position: ClinicalProseTemplate["slotPosition"],
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
		position?: ClinicalProseTemplate["slotPosition"],
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

	async list(
		context: ProseTemplateListContext = {},
	): Promise<ClinicalProseTemplate[]> {
		const { sql, params } = this.compiler.compileListClinicalProseTemplates(
			this.table,
			[
				context.kind && {
					column: "kind",
					op: "eq" as const,
					value: context.kind,
				},
				context.section && {
					column: "section",
					op: "eq" as const,
					value: context.section,
				},
				context.slotKey && {
					column: "slotKey",
					op: "eq" as const,
					value: context.slotKey,
				},
				context.targetSchema && {
					column: "targetSchema",
					op: "eq" as const,
					value: context.targetSchema,
				},
				context.workspaceId && {
					column: "workspaceId",
					op: "eq" as const,
					value: context.workspaceId,
				},
				context.specialtyId && {
					column: "specialtyId",
					op: "eq" as const,
					value: context.specialtyId,
				},
				context.activeOnly && { column: "active", op: "eq" as const, value: 1 },
			].filter(Boolean) as { column: string; op: "eq"; value: unknown }[],
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToTemplate(r));
	}

	async listRoots(context: Omit<ProseTemplateListContext, "kind"> = {}) {
		return this.list({ ...context, kind: "root", activeOnly: true });
	}

	async listComponents(
		context: Omit<ProseTemplateListContext, "kind"> & { slotKey: string },
	) {
		return this.list({ ...context, kind: "component", activeOnly: true });
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
			templateName: template.templateName,
			kind: template.kind,
			targetSchema: template.targetSchema,
			targetConceptId: template.targetConceptId ?? null,
			workspaceId: template.workspaceId ?? null,
			specialtyId: template.specialtyId ?? null,
			section: template.section ?? null,
			slotKey: template.slotKey ?? null,
			slotPosition: template.slotPosition,
			templateText: template.templateText,
			slotsBlob: JSON.stringify(template.slots || {}),
			active: template.active === false ? 0 : 1,
			source: "local",
		};
	}

	private rowToTemplate(row: Record<string, any>): ClinicalProseTemplate {
		const t: ClinicalProseTemplate = {
			templateId: row.templateId as string,
			templateName: String(row.templateName ?? row.templateId),
			kind: row.kind as ClinicalProseTemplate["kind"],
			targetSchema: row.targetSchema as string,
			slotPosition: row.slotPosition as ClinicalProseTemplate["slotPosition"],
			templateText: row.templateText as string,
			slots:
				typeof row.slotsBlob === "string"
					? JSON.parse(row.slotsBlob || "{}")
					: (row.slotsBlob ?? {}),
			active: row.active !== 0,
		};
		if (row.targetConceptId != null)
			t.targetConceptId = row.targetConceptId as string;
		if (row.workspaceId != null) t.workspaceId = row.workspaceId as string;
		if (row.specialtyId != null) t.specialtyId = row.specialtyId as string;
		if (row.section != null)
			t.section = row.section as ClinicalProseTemplate["section"];
		if (row.slotKey != null) t.slotKey = row.slotKey as string;
		return t;
	}
}
