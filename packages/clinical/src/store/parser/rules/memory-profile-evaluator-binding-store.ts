import type { ParserProfileEvaluatorBindingStore } from "./interfaces";

export class MemoryProfileEvaluatorBindingStore
	implements ParserProfileEvaluatorBindingStore
{
	private readonly bindings = new Map<string, Set<string>>();

	async bind(profileId: string, ruleId: string): Promise<void> {
		let profileBindings = this.bindings.get(profileId);
		if (!profileBindings) {
			profileBindings = new Set();
			this.bindings.set(profileId, profileBindings);
		}
		profileBindings.add(ruleId);
	}

	async unbind(profileId: string, ruleId: string): Promise<void> {
		const profileBindings = this.bindings.get(profileId);
		if (profileBindings) profileBindings.delete(ruleId);
	}

	async listBindings(profileId: string): Promise<string[]> {
		const profileBindings = this.bindings.get(profileId);
		if (!profileBindings) return [];
		return Array.from(profileBindings).sort();
	}
}
