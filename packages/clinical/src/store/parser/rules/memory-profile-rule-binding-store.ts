import type { ParserProfileRuleBindingStore } from "./interfaces";

export class MemoryProfileRuleBindingStore
	implements ParserProfileRuleBindingStore
{
	private readonly bindings = new Map<string, Map<string, number>>();

	async bind(
		profileId: string,
		ruleId: string,
		priority: number,
	): Promise<void> {
		let profileBindings = this.bindings.get(profileId);
		if (!profileBindings) {
			profileBindings = new Map();
			this.bindings.set(profileId, profileBindings);
		}
		profileBindings.set(ruleId, priority);
	}

	async unbind(profileId: string, ruleId: string): Promise<void> {
		const profileBindings = this.bindings.get(profileId);
		if (profileBindings) profileBindings.delete(ruleId);
	}

	async listBindings(
		profileId: string,
	): Promise<Array<{ ruleId: string; priority: number }>> {
		const profileBindings = this.bindings.get(profileId);
		if (!profileBindings) return [];
		return Array.from(profileBindings.entries())
			.map(([ruleId, priority]) => ({ ruleId, priority }))
			.sort((a, b) => a.priority - b.priority);
	}
}
