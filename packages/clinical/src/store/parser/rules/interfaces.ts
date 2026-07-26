import type { AttributeParserRule, ParserDictionaryRule } from "../interfaces";

export interface ParserAttributeRuleStore {
	get(ruleId: string): Promise<AttributeParserRule | null>;
	list(): Promise<AttributeParserRule[]>;
	set(rule: AttributeParserRule): Promise<void>;
	delete(ruleId: string): Promise<void>;
}

export interface ParserProfileRuleBindingStore {
	bind(profileId: string, ruleId: string, priority: number): Promise<void>;
	unbind(profileId: string, ruleId: string): Promise<void>;
	listBindings(
		profileId: string,
	): Promise<Array<{ ruleId: string; priority: number }>>;
}

export interface ParserEvaluatorRuleStore {
	get(ruleId: string): Promise<ParserDictionaryRule | null>;
	list(): Promise<ParserDictionaryRule[]>;
	set(rule: ParserDictionaryRule): Promise<void>;
	delete(ruleId: string): Promise<void>;
}

export interface ParserProfileEvaluatorBindingStore {
	bind(profileId: string, ruleId: string): Promise<void>;
	unbind(profileId: string, ruleId: string): Promise<void>;
	listBindings(profileId: string): Promise<string[]>;
}
