import type {
	AttributeParserRule,
	ParserDictionaryRule,
	ParserSyntaxProfile,
} from "../interfaces";
import type {
	ParserProfileCoreStore,
	ProfileTagStore,
} from "./profiles/interfaces";
import type {
	ConceptFieldRuleBindingStore,
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "./rules/interfaces";
import type { TagRecord, TagStore } from "./tags/interfaces";

export interface ParserProfileComposer {
	getFullProfile(profileId: string): Promise<ParserSyntaxProfile | null>;
}

export class DefaultParserProfileComposer implements ParserProfileComposer {
	constructor(
		private readonly profiles: ParserProfileCoreStore,
		private readonly tags: ProfileTagStore,
		private readonly tagStore: TagStore,
		private readonly attributeRules: ParserAttributeRuleStore,
		private readonly evaluatorRules: ParserEvaluatorRuleStore,
		private readonly attributeBindings: ParserProfileRuleBindingStore,
		private readonly evaluatorBindings: ParserProfileEvaluatorBindingStore,
		private readonly conceptFieldBindings?: ConceptFieldRuleBindingStore,
	) {}

	async getFullProfile(profileId: string): Promise<ParserSyntaxProfile | null> {
		const profile = await this.profiles.get(profileId);
		if (!profile) return null;

		const [profileTagIds, attributeBindingsList, evaluatorBindingsList, conceptFieldBindingsList] =
			await Promise.all([
				this.tags.getProfileTags(profileId),
				this.attributeBindings.listBindings(profileId),
				this.evaluatorBindings.listBindings(profileId),
				this.conceptFieldBindings?.listBindings(profileId) ?? Promise.resolve([]),
			]);

		const tagRecords = await this.resolveTags(profileTagIds);
		const resolvedAttributeRules = await this.resolveAttributeRules(
			attributeBindingsList,
		);
		const resolvedEvaluatorRules = await this.resolveEvaluatorRules(
			evaluatorBindingsList,
		);

		return {
			...profile,
			tagMappings: this.buildTagMappings(tagRecords),
			attributeRules: resolvedAttributeRules,
			evaluatorRules: resolvedEvaluatorRules,
		};
	}

	private async resolveTags(tagIds: string[]): Promise<TagRecord[]> {
		const results = await Promise.all(
			tagIds.map((id) => this.tagStore.get(id)),
		);
		return results.filter((t): t is TagRecord => t !== null);
	}

	private buildTagMappings(tags: TagRecord[]): Record<string, string> {
		const mappings: Record<string, string> = {};
		for (const tag of tags) {
			mappings[tag.tagId] = tag.tagName;
		}
		return mappings;
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
