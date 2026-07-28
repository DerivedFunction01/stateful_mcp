import type { KvBackend } from "@stateful-mcp/core";
import type {
	SharedFieldAnchorRule,
	SharedFieldAnchorStore,
} from "../../../parser/field-shared/shared-field-anchor";

export class KvSharedFieldAnchorStore implements SharedFieldAnchorStore {
	private readonly prefix = "anchor:";

	constructor(private readonly backend: KvBackend) {}

	async get(ruleId: string): Promise<SharedFieldAnchorRule | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + ruleId];
		return (value as SharedFieldAnchorRule | undefined) ?? null;
	}

	async listBySchema(targetSchema: string): Promise<SharedFieldAnchorRule[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(
				([k, v]) =>
					k.startsWith(this.prefix) &&
					(v as SharedFieldAnchorRule).targetSchema === targetSchema,
			)
			.map(([, v]) => v as SharedFieldAnchorRule);
	}

	async listForContext(context: {
		workspaceId?: string;
		personnelId?: string;
	}): Promise<SharedFieldAnchorRule[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k, v]) => {
				if (!k.startsWith(this.prefix)) return false;
				const r = v as SharedFieldAnchorRule;
				if (
					context.workspaceId !== undefined &&
					r.workspaceId !== context.workspaceId
				)
					return false;
				if (
					context.personnelId !== undefined &&
					r.personnelId !== context.personnelId
				)
					return false;
				return true;
			})
			.map(([, v]) => v as SharedFieldAnchorRule);
	}

	async set(rule: SharedFieldAnchorRule): Promise<void> {
		await this.backend.set(this.prefix + rule.ruleId, rule);
		await this.backend.save();
	}

	async delete(ruleId: string): Promise<void> {
		await this.backend.delete(this.prefix + ruleId);
		await this.backend.save();
	}
}
