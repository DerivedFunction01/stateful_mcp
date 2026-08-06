import type { KvBackend } from "@stateful-mcp/core";
import type { ProseTemplateUsage, ProseTemplateUsageStore } from "./usage";

const PREFIX = "clinicalProseTemplateUsage:";

export class KvClinicalProseTemplateUsageStore
	implements ProseTemplateUsageStore
{
	constructor(private readonly backend: KvBackend) {}

	private key(input: {
		templateId: string;
		usageKind: string;
		sessionId: string;
		workspaceId?: string;
		rootTemplateId?: string;
		slotKey?: string;
	}): string {
		return `${PREFIX}${[
			input.templateId,
			input.usageKind,
			input.sessionId,
			input.workspaceId ?? "",
			input.rootTemplateId ?? "",
			input.slotKey ?? "",
		]
			.map(encodeURIComponent)
			.join(":")}`;
	}

	async recordUse(input: Parameters<ProseTemplateUsageStore["recordUse"]>[0]) {
		const data = await this.backend.load();
		const now = input.usedAt ?? new Date().toISOString();
		const key = this.key(input);
		const current = (data[key] as ProseTemplateUsage | undefined) ?? {
			templateId: input.templateId,
			usageKind: input.usageKind,
			sessionId: input.sessionId,
			workspaceId: input.workspaceId,
			rootTemplateId: input.rootTemplateId,
			slotKey: input.slotKey,
			count: 0,
			firstUsedAt: now,
			lastUsedAt: now,
		};
		const next = { ...current, count: current.count + 1, lastUsedAt: now };
		await this.backend.set(key, next);
		await this.backend.save();
	}

	async listRanked(
		input: Parameters<ProseTemplateUsageStore["listRanked"]>[0] = {},
	) {
		const data = await this.backend.load();
		const rows = Object.entries(data)
			.filter(([key]) => key.startsWith(PREFIX))
			.map(([, value]) => value as ProseTemplateUsage)
			.filter(
				(row) =>
					(input.sessionId === undefined ||
						row.sessionId === input.sessionId) &&
					(input.workspaceId === undefined ||
						row.workspaceId === input.workspaceId) &&
					(input.usageKind === undefined || row.usageKind === input.usageKind),
			);
		rows.sort((left, right) =>
			input.order === "lru"
				? Date.parse(left.lastUsedAt) - Date.parse(right.lastUsedAt)
				: input.order === "most_used"
					? right.count - left.count ||
						Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt)
					: Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt),
		);
		return rows.slice(0, input.limit ?? 50);
	}

	async removeTemplate(templateId: string) {
		const data = await this.backend.load();
		for (const [key, value] of Object.entries(data)) {
			if (
				key.startsWith(PREFIX) &&
				(value as ProseTemplateUsage).templateId === templateId
			)
				await this.backend.delete(key);
		}
		await this.backend.save();
	}
}
