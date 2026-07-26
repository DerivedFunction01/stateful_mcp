import type { KvBackend } from "@stateful-mcp/core";
import type { ParserProfileEvaluatorBindingStore } from "./interfaces";

export class KvProfileEvaluatorBindingStore
	implements ParserProfileEvaluatorBindingStore
{
	private readonly prefix = "profileEvaluatorBinding:";

	constructor(private readonly backend: KvBackend) {}

	private bindingKey(profileId: string, ruleId: string): string {
		return `${this.prefix}${profileId}::${ruleId}`;
	}

	async bind(profileId: string, ruleId: string): Promise<void> {
		await this.backend.set(this.bindingKey(profileId, ruleId), true);
		await this.backend.save();
	}

	async unbind(profileId: string, ruleId: string): Promise<void> {
		await this.backend.delete(this.bindingKey(profileId, ruleId));
		await this.backend.save();
	}

	async listBindings(profileId: string): Promise<string[]> {
		const data = await this.backend.load();
		const profilePrefix = `${this.prefix}${profileId}::`;
		return Object.keys(data)
			.filter((k) => k.startsWith(profilePrefix))
			.map((k) => k.slice(profilePrefix.length))
			.sort();
	}
}
