import type { DictionaryStore } from "@stateful-mcp/core";
import type { ParserProfileCoreStore } from "../../store/parser/profiles/interfaces";
import type {
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "../../store/parser/rules/interfaces";
import type { CommandTemplateStore } from "../../v2/stores/command-templates/interfaces";
import type { FacilityStore } from "../../v2/stores/facilities/interfaces";
import type { JurisdictionalDisplayStore } from "../../v2/stores/jurisdictional-displays/interfaces";
import type { PersonnelStore } from "../../v2/stores/personnel/interfaces";
import type { ClinicalProseTemplateStore } from "../../v2/stores/prose-templates/interfaces";
import type {
	StopWordStore,
	StopWordWordListStore,
} from "../../v2/stores/stop-words/interfaces";

export interface BootstrapStores {
	dictionaryStore: DictionaryStore;
	profiles: ParserProfileCoreStore;
	attributeRules: ParserAttributeRuleStore;
	evaluatorRules: ParserEvaluatorRuleStore;
	attributeBindings: ParserProfileRuleBindingStore;
	evaluatorBindings: ParserProfileEvaluatorBindingStore;
	stopWordProfiles: StopWordStore;
	stopWordWordLists: StopWordWordListStore;
	proseTemplates: ClinicalProseTemplateStore;
	commandTemplates: CommandTemplateStore;
	personnel: PersonnelStore;
	facilities: FacilityStore;
	jurisdictionalDisplays: JurisdictionalDisplayStore;
}
