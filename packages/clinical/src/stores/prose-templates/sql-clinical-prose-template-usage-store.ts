import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ProseTemplateUsage, ProseTemplateUsageStore } from "./usage";

export class SqlClinicalProseTemplateUsageStore
	implements ProseTemplateUsageStore
{
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "clinical_prose_template_usage",
	) {
		this.ready = this.ensureTable();
	}

	private async ensureTable() {
		await this.executor.exec(`CREATE TABLE IF NOT EXISTS ${this.table} (
			templateId TEXT NOT NULL,
			usageKind TEXT NOT NULL,
			sessionId TEXT NOT NULL,
			workspaceId TEXT NOT NULL DEFAULT '',
			rootTemplateId TEXT NOT NULL DEFAULT '',
			slotKey TEXT NOT NULL DEFAULT '',
			count INTEGER NOT NULL DEFAULT 0,
			firstUsedAt TEXT NOT NULL,
			lastUsedAt TEXT NOT NULL,
			PRIMARY KEY (templateId, usageKind, sessionId, workspaceId, rootTemplateId, slotKey)
		)`);
	}

	async recordUse(input: Parameters<ProseTemplateUsageStore["recordUse"]>[0]) {
		await this.ready;
		const now = input.usedAt ?? new Date().toISOString();
		await this.executor.exec(
			`INSERT INTO ${this.table} (templateId, usageKind, sessionId, workspaceId, rootTemplateId, slotKey, count, firstUsedAt, lastUsedAt)
			 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
			 ON CONFLICT(templateId, usageKind, sessionId, workspaceId, rootTemplateId, slotKey)
			 DO UPDATE SET count = count + 1, lastUsedAt = excluded.lastUsedAt`,
			[
				input.templateId,
				input.usageKind,
				input.sessionId,
				input.workspaceId ?? "",
				input.rootTemplateId ?? "",
				input.slotKey ?? "",
				now,
				now,
			],
		);
	}

	async listRanked(
		input: Parameters<ProseTemplateUsageStore["listRanked"]>[0] = {},
	) {
		await this.ready;
		const clauses: string[] = [];
		const params: unknown[] = [];
		if (input.sessionId !== undefined) {
			clauses.push("sessionId = ?");
			params.push(input.sessionId);
		}
		if (input.workspaceId !== undefined) {
			clauses.push("workspaceId = ?");
			params.push(input.workspaceId);
		}
		if (input.usageKind !== undefined) {
			clauses.push("usageKind = ?");
			params.push(input.usageKind);
		}
		const order =
			input.order === "lru"
				? "lastUsedAt ASC"
				: input.order === "most_used"
					? "count DESC, lastUsedAt DESC"
					: "lastUsedAt DESC";
		const rows = await this.executor.query(
			`SELECT * FROM ${this.table}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ${Math.max(1, input.limit ?? 50)}`,
			params,
		);
		return rows.map(
			(row): ProseTemplateUsage => ({
				templateId: String(row.templateId),
				usageKind: row.usageKind,
				sessionId: String(row.sessionId),
				workspaceId: row.workspaceId || undefined,
				rootTemplateId: row.rootTemplateId || undefined,
				slotKey: row.slotKey || undefined,
				count: Number(row.count),
				firstUsedAt: String(row.firstUsedAt),
				lastUsedAt: String(row.lastUsedAt),
			}),
		);
	}

	async removeTemplate(templateId: string) {
		await this.ready;
		await this.executor.exec(`DELETE FROM ${this.table} WHERE templateId = ?`, [
			templateId,
		]);
	}
}
