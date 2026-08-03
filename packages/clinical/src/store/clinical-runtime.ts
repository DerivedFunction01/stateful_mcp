import type { DictionaryStore } from "@stateful-mcp/core";
import type { SharedFieldAnchorStore } from "../parser/field-shared/shared-field-anchor";
import {
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "./adapter-types";
import type { ClinicalStoreConfig } from "./clinical-config";
import { resolveNgramStoreLocator } from "./learning/autocomplete-resolver";
import type { NgramStore } from "./learning/interfaces";
import type { ParserCommandMacroStore } from "./parser/command-macros/interfaces";
import {
	CommandMacroFieldMetadataCatalog,
	type CommandFieldMetadataStore,
} from "../parser/command/command-field-metadata";
import type { ParserConceptDefaultStore as NewParserConceptDefaultStore } from "./parser/concept_defaults/interfaces";
import type { ConceptFieldStore } from "./parser/concept_fields/interfaces";
import {
	resolveCalibrationExceptionStore,
	resolveCommandMacroStore,
	resolveConceptDefaultStore,
	resolveConceptFieldStore,
	resolveFacilityStore,
	resolveParserProfileStores,
	resolveParserRuleStores,
	resolvePersonnelStore,
	resolveReferenceStores,
	resolveSharedFieldAnchorStore,
	resolveStopWordWordListStore,
} from "./parser/parser-backend-resolver";
import { DefaultParserProfileComposer } from "./parser/parser-composer";
import type { ParserProfileCoreStore } from "./parser/profiles/interfaces";
import type {
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "./parser/rules/interfaces";
import type { CalibrationExceptionStore } from "./reference/calibration/interfaces";
import type { CommandTemplateStore } from "./reference/command-templates/interfaces";
import type { FacilityStore } from "./reference/facilities/interfaces";
import type { JurisdictionalDisplayStore } from "./reference/jurisdictional-displays/interfaces";
import type { PersonnelStore } from "./reference/personnel/interfaces";
import type { ClinicalProseTemplateStore } from "./reference/prose-templates/interfaces";
import { DefaultStopWordStore } from "./reference/stop-words/default-stop-word-store";
import type {
	StopWordStore,
	StopWordWordListStore,
} from "./reference/stop-words/interfaces";

// ── Public types ─────────────────────────────────────────────────────

export interface ClinicalRuntimeParserStores {
	dictionaryStore?: DictionaryStore;
	profiles: ParserProfileCoreStore;
	attributeRules: ParserAttributeRuleStore;
	evaluatorRules: ParserEvaluatorRuleStore;
	attributeBindings: ParserProfileRuleBindingStore;
	evaluatorBindings: ParserProfileEvaluatorBindingStore;
	conceptDefaults: NewParserConceptDefaultStore;
	conceptFields: ConceptFieldStore;
	jurisdictionalDisplays: JurisdictionalDisplayStore;
	stopWordProfiles: StopWordStore;
	stopWordWordLists: StopWordWordListStore;
	proseTemplates: ClinicalProseTemplateStore;
	commandTemplates: CommandTemplateStore;
	calibration: CalibrationExceptionStore;
	personnel: PersonnelStore;
	facilities: FacilityStore;
	sharedFieldAnchors: SharedFieldAnchorStore;
	commandMacros: ParserCommandMacroStore;
	commandFieldMetadata: CommandFieldMetadataStore;
}

export interface ClinicalRuntime {
	config: ClinicalStoreConfig;
	parserStores: ClinicalRuntimeParserStores;
	ngramStore?: NgramStore;
}

// ── Factory using decomposed stores ──────────────────────────────────────────

export async function createClinicalRuntime(
	config: ClinicalStoreConfig,
): Promise<ClinicalRuntime> {
	const [
		profiles,
		rules,
		refs,
		conceptDefaults,
		conceptFields,
		calibration,
		personnel,
		facilities,
		sharedFieldAnchors,
		stopWordWordLists,
		commandMacros,
	] = await Promise.all([
		resolveParserProfileStores(config),
		resolveParserRuleStores(config),
		resolveReferenceStores(config),
		resolveConceptDefaultStore(config),
		resolveConceptFieldStore(config),
		resolveCalibrationExceptionStore(config),
		resolvePersonnelStore(config),
		resolveFacilityStore(config),
		resolveSharedFieldAnchorStore(config),
		resolveStopWordWordListStore(config),
		resolveCommandMacroStore(config),
	]);

	const ngramStores = await buildNgramStores(config);

	const composer = new DefaultParserProfileComposer(
		profiles,
		rules.attributeRules,
		rules.evaluatorRules,
		rules.attributeBindings,
		rules.evaluatorBindings,
	);

	const stopWordStore = new DefaultStopWordStore(
		refs.stopWordProfiles as any,
		stopWordWordLists,
	);

	return {
		config,
		parserStores: {
			profiles,
			attributeRules: rules.attributeRules,
			evaluatorRules: rules.evaluatorRules,
			attributeBindings: rules.attributeBindings,
			evaluatorBindings: rules.evaluatorBindings,
			conceptDefaults,
			conceptFields,
			jurisdictionalDisplays: refs.jurisdictionalDisplays,
			stopWordProfiles: stopWordStore,
			stopWordWordLists,
			proseTemplates: refs.proseTemplates,
			commandTemplates: refs.commandTemplates,
			calibration,
			personnel,
			facilities,
			sharedFieldAnchors,
			commandMacros,
			commandFieldMetadata: new CommandMacroFieldMetadataCatalog(commandMacros),
		},
		ngramStore: ngramStores[0],
	};
}

async function buildNgramStores(
	config: ClinicalStoreConfig,
): Promise<NgramStore[]> {
	const adapters = getClinicalAdapterConfigs("autocomplete", {
		autocomplete: config.domains.autocomplete.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return await Promise.all(
		adapters
			.filter((a) => a.implemented !== false && a.primary)
			.map((a) => resolveNgramStoreLocator(a.primary)),
	);
}
