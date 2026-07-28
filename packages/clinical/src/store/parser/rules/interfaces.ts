import type { AttributeParserRule, ParserDictionaryRule } from "../interfaces";

export type StoredAttributeRule = AttributeParserRule & { ruleId: string };

export interface ParserAttributeRuleStore {
	get(ruleId: string): Promise<StoredAttributeRule | null>;
	list(): Promise<StoredAttributeRule[]>;
	set(rule: StoredAttributeRule): Promise<void>;
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

export interface ConceptFieldRuleBindingStore {
	bind(profileId: string, ruleId: string, priority: number): Promise<void>;
	unbind(profileId: string, ruleId: string): Promise<void>;
	listBindings(
		profileId: string,
	): Promise<Array<{ ruleId: string; priority: number }>>;
}
