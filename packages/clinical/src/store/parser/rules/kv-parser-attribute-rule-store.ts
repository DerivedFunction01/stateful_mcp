import type { KvBackend } from "@stateful-mcp/core";
import type {
	ParserAttributeRuleStore,
	StoredAttributeRule,
} from "./interfaces";

export class KvParserAttributeRuleStore implements ParserAttributeRuleStore {
	private readonly prefix = "attributeRule:";

	constructor(private readonly backend: KvBackend) {}

	async get(ruleId: string): Promise<StoredAttributeRule | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + ruleId];
		return (value as StoredAttributeRule | undefined) ?? null;
	}

	async list(): Promise<StoredAttributeRule[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as StoredAttributeRule);
	}

	async set(rule: StoredAttributeRule): Promise<void> {
		await this.backend.set(this.prefix + rule.ruleId, rule);
		await this.backend.save();
	}

	async delete(ruleId: string): Promise<void> {
		await this.backend.delete(this.prefix + ruleId);
		await this.backend.save();
	}
}
