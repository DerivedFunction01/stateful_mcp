import type { KvBackend } from "@stateful-mcp/core";
import type { ConceptFieldRuleBindingStore } from "./interfaces";

export class KvConceptFieldRuleBindingStore
	implements ConceptFieldRuleBindingStore
{
	private readonly prefix = "conceptFieldRuleBinding:";

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
			profileId,
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
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix + profileId + "::"))
			.map(([, v]) => ({
				ruleId: (v as any).ruleId as string,
				priority: Number((v as any).priority),
			}));
	}
}
