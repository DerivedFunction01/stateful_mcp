import type { KvBackend } from "@stateful-mcp/core";
import type { ParserProfileRuleBindingStore } from "./interfaces";

export class KvProfileRuleBindingStore
	implements ParserProfileRuleBindingStore
{
	private readonly prefix = "profileRuleBinding:";

	constructor(private readonly backend: KvBackend) {}

	private bindingKey(profileId: string, ruleId: string): string {
		return `${this.prefix}${profileId}::${ruleId}`;
	}

	async bind(
		profileId: string,
		ruleId: string,
		priority: number,
	): Promise<void> {
		await this.backend.set(this.bindingKey(profileId, ruleId), {
			ruleId,
			priority,
		});
		await this.backend.save();
	}

	async unbind(profileId: string, ruleId: string): Promise<void> {
		await this.backend.delete(this.bindingKey(profileId, ruleId));
		await this.backend.save();
	}

	async listBindings(
		profileId: string,
	): Promise<Array<{ ruleId: string; priority: number }>> {
		const data = await this.backend.load();
		const profilePrefix = `${this.prefix}${profileId}::`;
		return Object.entries(data)
			.filter(([k]) => k.startsWith(profilePrefix))
			.map(([, v]) => v as { ruleId: string; priority: number })
			.sort((a, b) => a.priority - b.priority);
	}
}
