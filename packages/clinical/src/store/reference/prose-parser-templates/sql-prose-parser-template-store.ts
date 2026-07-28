import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ProseTemplate } from "../../../schemas/prose-template";
import { ReferenceQueryCompiler } from "../../sql/reference-query-compiler";
import type { ProseParserTemplateStore } from "./interfaces";

export class SqlProseTemplateStore implements ProseParserTemplateStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "prose_parser_templates",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getProseParserTemplatesTableDDL(this.table);
		await this.executor.exec(ddl.sql);
	}

	async get(templateId: string): Promise<ProseTemplate | null> {
		const { sql, params } = this.compiler.compileGetProseParserTemplate(
			templateId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToTemplate(row) : null;
	}

	async listBySchema(targetSchema: string): Promise<ProseTemplate[]> {
		const { sql, params } = this.compiler.compileListProseParserTemplates(
			this.table,
			[{ column: "targetSchema", op: "eq", value: targetSchema }],
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToTemplate(r));
	}

	async listAll(): Promise<ProseTemplate[]> {
		const { sql, params } = this.compiler.compileListProseParserTemplates(
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToTemplate(r));
	}

	async set(template: ProseTemplate): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertProseParserTemplate(
			this.templateToRow(template),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(templateId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteProseParserTemplate(
			templateId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private templateToRow(template: ProseTemplate): Record<string, unknown> {
		return {
			templateId: template.templateId,
			parentTemplateId: template.parentTemplateId ?? null,
			targetSchema: template.targetSchema,
			sectionPattern: template.sectionPattern,
			priority: template.priority ?? null,
			maxItems: template.maxItems ?? null,
			slotsBlob: JSON.stringify(template.slots),
			remnantContextBlob: template.remnantContext
				? JSON.stringify(template.remnantContext)
				: null,
			source: "local",
		};
	}

	private rowToTemplate(row: Record<string, any>): ProseTemplate {
		const slots = this.parseJsonBlob(row.slotsBlob);
		const remnantContext = row.remnantContextBlob
			? this.parseJsonBlob(row.remnantContextBlob)
			: undefined;

		const t: ProseTemplate = {
			templateId: row.templateId as string,
			targetSchema: row.targetSchema as string,
			sectionPattern: row.sectionPattern as string,
			slots: Array.isArray(slots) ? slots : [],
		};

		if (row.parentTemplateId != null) {
			t.parentTemplateId = row.parentTemplateId as string;
		}
		if (row.priority != null) {
			t.priority = Number(row.priority);
		}
		if (row.maxItems != null) {
			t.maxItems = Number(row.maxItems);
		}
		if (remnantContext != null) {
			t.remnantContext = remnantContext;
		}

		return t;
	}

	private parseJsonBlob(blob: unknown): any {
		if (typeof blob === "string") {
			try {
				return JSON.parse(blob);
			} catch {
				return blob;
			}
		}
		return blob;
	}
}
