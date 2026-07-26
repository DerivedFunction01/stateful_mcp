import type { ParserDictionaryRule } from "../interfaces";
import type { ParserEvaluatorRuleStore } from "./interfaces";

export class MemoryParserEvaluatorRuleStore
	implements ParserEvaluatorRuleStore
{
	private readonly rules = new Map<string, ParserDictionaryRule>();

	async get(ruleId: string): Promise<ParserDictionaryRule | null> {
		return this.rules.get(ruleId) ?? null;
	}

	async list(): Promise<ParserDictionaryRule[]> {
		return Array.from(this.rules.values()).map((r) => ({ ...r }));
	}

	async set(rule: ParserDictionaryRule): Promise<void> {
		this.rules.set(rule.ruleId, { ...rule });
	}

	async delete(ruleId: string): Promise<void> {
		this.rules.delete(ruleId);
	}
}
