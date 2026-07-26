import type {
	ParserAttributeRuleStore,
	StoredAttributeRule,
} from "./interfaces";

export class MemoryParserAttributeRuleStore
	implements ParserAttributeRuleStore
{
	private readonly rules = new Map<string, StoredAttributeRule>();

	async get(ruleId: string): Promise<StoredAttributeRule | null> {
		return this.rules.get(ruleId) ?? null;
	}

	async list(): Promise<StoredAttributeRule[]> {
		return Array.from(this.rules.values()).map((r) => ({ ...r }));
	}

	async set(rule: StoredAttributeRule): Promise<void> {
		this.rules.set(rule.ruleId, { ...rule });
	}

	async delete(ruleId: string): Promise<void> {
		this.rules.delete(ruleId);
	}
}
