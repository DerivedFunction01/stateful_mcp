import type { SharedFieldAnchorStore } from "../../parser/field-shared/shared-field-anchor";
import type { ParserMacroStore } from "../../store/interfaces";
import type { ParserConceptDefaultStore } from "../../store/parser/concept_defaults/interfaces";
import type { ConceptFieldStore } from "../../store/parser/concept_fields/interfaces";
import type {
	ParserProfileCoreStore,
	ProfileTagStore,
} from "../../store/parser/profiles/interfaces";
import type {
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "../../store/parser/rules/interfaces";
import type { TagStore } from "../../store/parser/tags/interfaces";
import type { ProseParserTemplateStore } from "../../store/reference/prose-parser-templates/interfaces";
import type { ClinicalProseTemplateStore } from "../../store/reference/prose-templates/interfaces";
import type {
	StopWordStore,
	StopWordWordListStore,
} from "../../store/reference/stop-words/interfaces";

export interface BootstrapStores {
	profiles: ParserProfileCoreStore;
	profileTags: ProfileTagStore;
	attributeRules: ParserAttributeRuleStore;
	evaluatorRules: ParserEvaluatorRuleStore;
	attributeBindings: ParserProfileRuleBindingStore;
	evaluatorBindings: ParserProfileEvaluatorBindingStore;
	tags: TagStore;
	conceptDefaults: ParserConceptDefaultStore;
	conceptFields: ConceptFieldStore;
	sharedFieldAnchors: SharedFieldAnchorStore;
	stopWordProfiles: StopWordStore;
	stopWordWordLists: StopWordWordListStore;
	proseTemplates: ClinicalProseTemplateStore;
	proseParserTemplates: ProseParserTemplateStore;
	macros: ParserMacroStore;
}
