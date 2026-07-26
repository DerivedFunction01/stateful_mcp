import type { KvBackend } from "@stateful-mcp/core";
import type { ParserDictionaryRule } from "../interfaces";
import type { ParserEvaluatorRuleStore } from "./interfaces";

export class KvParserEvaluatorRuleStore implements ParserEvaluatorRuleStore {
	private readonly prefix = "evaluatorRule:";

	constructor(private readonly backend: KvBackend) {}

	async get(ruleId: string): Promise<ParserDictionaryRule | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + ruleId];
		return (value as ParserDictionaryRule | undefined) ?? null;
	}

	async list(): Promise<ParserDictionaryRule[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ParserDictionaryRule);
	}

	async set(rule: ParserDictionaryRule): Promise<void> {
		await this.backend.set(this.prefix + rule.ruleId, rule);
		await this.backend.save();
	}

	async delete(ruleId: string): Promise<void> {
		await this.backend.delete(this.prefix + ruleId);
		await this.backend.save();
	}
}
