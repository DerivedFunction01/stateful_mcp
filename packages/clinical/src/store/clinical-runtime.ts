import type { DictionaryStore } from "@stateful-mcp/core";
import type { SharedFieldAnchorStore } from "../parser/field-shared/shared-field-anchor";
import {
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "./adapter-types";
import type { ClinicalStoreConfig } from "./clinical-config";
import type { ParserMacroStore } from "./interfaces";
import { resolveAutocompleteTransitionStoreLocator, resolveNgramStoreLocator } from "./learning/autocomplete-resolver";
import type {
	AutocompleteTransitionStore,
	NgramStore,
	OrderedLearningStore,
	ParsedCellStore,
} from "./learning/interfaces";
import { resolveParsedCellStoreLocatorV2 } from "./learning/learning-backend-resolver";
import { resolveOrderedLearningStoreLocator } from "./learning/ordered-learning-resolver";
import type { ParserConceptDefaultStore as NewParserConceptDefaultStore } from "./parser/concept_defaults/interfaces";
import type { ConceptFieldStore } from "./parser/concept_fields/interfaces";
import {
	resolveCalibrationExceptionStore,
	resolveConceptDefaultStore,
	resolveConceptFieldStore,
	resolveFacilityStore,
	resolveMacroStore,
	resolveParserProfileStores,
	resolveParserRuleStores,
	resolvePersonnelStore,
	resolveReferenceStores,
	resolveSharedFieldAnchorStore,
	resolveStopWordWordListStore,
} from "./parser/parser-backend-resolver";
import { DefaultParserProfileComposer } from "./parser/parser-composer";
import type {
	ParserProfileCoreStore,
	ProfileTagStore,
} from "./parser/profiles/interfaces";
import type {
	ParserAttributeRuleStore,
	ParserEvaluatorRuleStore,
	ParserProfileEvaluatorBindingStore,
	ParserProfileRuleBindingStore,
} from "./parser/rules/interfaces";
import type { TagStore } from "./parser/tags/interfaces";
import type { CalibrationExceptionStore } from "./reference/calibration/interfaces";
import type { FacilityStore } from "./reference/facilities/interfaces";
import type { JurisdictionalDisplayStore } from "./reference/jurisdictional-displays/interfaces";
import type { PersonnelStore } from "./reference/personnel/interfaces";
import type { ProseParserTemplateStore } from "./reference/prose-parser-templates/interfaces";
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
	profileTags: ProfileTagStore;
	attributeRules: ParserAttributeRuleStore;
	evaluatorRules: ParserEvaluatorRuleStore;
	attributeBindings: ParserProfileRuleBindingStore;
	evaluatorBindings: ParserProfileEvaluatorBindingStore;
	tags: TagStore;
	conceptDefaults: NewParserConceptDefaultStore;
	conceptFields: ConceptFieldStore;
	jurisdictionalDisplays: JurisdictionalDisplayStore;
	stopWordProfiles: StopWordStore;
	stopWordWordLists: StopWordWordListStore;
	proseTemplates: ClinicalProseTemplateStore;
	proseParserTemplates: ProseParserTemplateStore;
	calibration: CalibrationExceptionStore;
	personnel: PersonnelStore;
	facilities: FacilityStore;
	sharedFieldAnchors: SharedFieldAnchorStore;
	macros: ParserMacroStore;
}

export interface ClinicalRuntime {
	config: ClinicalStoreConfig;
	parserStores: ClinicalRuntimeParserStores;
	learningStores: ParsedCellStore[];
	orderedLearningStores: OrderedLearningStore[];
	autocompleteTransitionStores: AutocompleteTransitionStore[];
	autocompleteTransitionStore?: AutocompleteTransitionStore;
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
		macros,
		orderedLearningStores,
		autocompleteTransitionStores,
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
		resolveMacroStore(config),
		buildOrderedLearningStores(config),
		buildAutocompleteTransitionStores(config),
	]);

	const ngramStores = await buildNgramStores(config);

	const composer = new DefaultParserProfileComposer(
		profiles.core,
		profiles.tags,
		refs.tags,
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
			profiles: profiles.core,
			profileTags: profiles.tags,
			attributeRules: rules.attributeRules,
			evaluatorRules: rules.evaluatorRules,
			attributeBindings: rules.attributeBindings,
			evaluatorBindings: rules.evaluatorBindings,
			tags: refs.tags,
			conceptDefaults,
			conceptFields,
			jurisdictionalDisplays: refs.jurisdictionalDisplays,
			stopWordProfiles: stopWordStore,
			stopWordWordLists,
			proseTemplates: refs.proseTemplates,
			proseParserTemplates: refs.proseParserTemplates,
			calibration,
			personnel,
			facilities,
			sharedFieldAnchors,
			macros,
		},
		learningStores: await buildLearningStores(config),
		orderedLearningStores,
		autocompleteTransitionStores,
		autocompleteTransitionStore: autocompleteTransitionStores[0],
		ngramStore: ngramStores[0],
	};
}

async function buildLearningStores(
	config: ClinicalStoreConfig,
): Promise<ParsedCellStore[]> {
	const adapters = getClinicalAdapterConfigs("learning", {
		learning: config.domains.learning.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return await Promise.all(
		adapters
			.filter((a) => a.implemented !== false && a.primary)
			.map((a) => resolveParsedCellStoreLocatorV2(a.primary, a.weights)),
	);
}

async function buildOrderedLearningStores(
	config: ClinicalStoreConfig,
): Promise<OrderedLearningStore[]> {
	const adapters = getClinicalAdapterConfigs("ordered_learning", {
		ordered_learning: config.domains.ordered_learning.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return await Promise.all(
		adapters
			.filter((a) => a.implemented !== false && a.primary)
			.map((a) => resolveOrderedLearningStoreLocator(a.primary)),
	);
}

async function buildAutocompleteTransitionStores(
	config: ClinicalStoreConfig,
): Promise<AutocompleteTransitionStore[]> {
	const adapters = getClinicalAdapterConfigs("autocomplete", {
		autocomplete: config.domains.autocomplete.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return await Promise.all(
		adapters
			.filter((a) => a.implemented !== false && a.primary)
			.map((a) => resolveAutocompleteTransitionStoreLocator(a.primary)),
	);
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
