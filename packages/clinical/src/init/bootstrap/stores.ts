import type { DictionaryStore } from "@stateful-mcp/core";
import type { ParserProfileCoreStore } from "../../store/parser/profiles/interfaces";
import type {
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "../../store/parser/rules/interfaces";
import type { CommandTemplateStore } from "../../store/reference/command-templates/interfaces";
import type { FacilityStore } from "../../store/reference/facilities/interfaces";
import type { JurisdictionalDisplayStore } from "../../store/reference/jurisdictional-displays/interfaces";
import type { PersonnelStore } from "../../store/reference/personnel/interfaces";
import type { ClinicalProseTemplateStore } from "../../store/reference/prose-templates/interfaces";
import type {
	StopWordStore,
	StopWordWordListStore,
} from "../../store/reference/stop-words/interfaces";

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
