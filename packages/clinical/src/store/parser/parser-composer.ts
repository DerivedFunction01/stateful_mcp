import type {
	AttributeParserRule,
	ParserDictionaryRule,
	ParserSyntaxProfile,
} from "../interfaces";
import type { ParserProfileCoreStore } from "./profiles/interfaces";
import type {
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "./rules/interfaces";

export interface ParserProfileComposer {
	getFullProfile(profileId: string): Promise<ParserSyntaxProfile | null>;
}

export class DefaultParserProfileComposer implements ParserProfileComposer {
	constructor(
		private readonly profiles: ParserProfileCoreStore,
		private readonly attributeRules: ParserAttributeRuleStore,
		private readonly evaluatorRules: ParserEvaluatorRuleStore,
		private readonly attributeBindings: ParserProfileRuleBindingStore,
		private readonly evaluatorBindings: ParserProfileEvaluatorBindingStore,
	) {}

	async getFullProfile(profileId: string): Promise<ParserSyntaxProfile | null> {
		const profile = await this.profiles.get(profileId);
		if (!profile) return null;

		const [attributeBindingsList, evaluatorBindingsList] = await Promise.all([
			this.attributeBindings.listBindings(profileId),
			this.evaluatorBindings.listBindings(profileId),
		]);

		const resolvedAttributeRules = await this.resolveAttributeRules(
			attributeBindingsList,
		);
		const resolvedEvaluatorRules = await this.resolveEvaluatorRules(
			evaluatorBindingsList,
		);

		return {
			...profile,
			attributeRules: resolvedAttributeRules,
			evaluatorRules: resolvedEvaluatorRules,
		};
	}

	private async resolveAttributeRules(
		bindings: Array<{ ruleId: string; priority: number }>,
	): Promise<AttributeParserRule[]> {
		const rules = await Promise.all(
			bindings.map((b) => this.attributeRules.get(b.ruleId)),
		);
		return rules
			.filter((r): r is NonNullable<typeof r> => r !== null)
			.map((r) => r as AttributeParserRule);
	}

	private async resolveEvaluatorRules(
		ruleIds: string[],
	): Promise<ParserDictionaryRule[]> {
		const rules = await Promise.all(
			ruleIds.map((id) => this.evaluatorRules.get(id)),
		);
		return rules.filter((r): r is NonNullable<typeof r> => r !== null);
	}
}
