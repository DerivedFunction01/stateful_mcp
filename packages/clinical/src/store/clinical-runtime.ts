import type { SharedFieldAnchorStore } from "../parser/field-shared/shared-field-anchor";
import {
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "./adapter-types";
import type { ClinicalStoreConfig } from "./clinical-config";
import { resolveAutocompleteTransitionStoreLocator } from "./learning/autocomplete-resolver";
import type {
	AutocompleteTransitionStore,
	OrderedLearningStore,
	ParsedCellStore,
} from "./learning/interfaces";
import { resolveParsedCellStoreLocatorV2 } from "./learning/learning-backend-resolver";
import { resolveOrderedLearningStoreLocator } from "./learning/ordered-learning-resolver";
import type { ParserConceptDefaultStore as NewParserConceptDefaultStore } from "./parser/concept_defaults/interfaces";
import {
	resolveCalibrationExceptionStore,
	resolveConceptDefaultStore,
	resolveFacilityStore,
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
import type { StopWordStore } from "./reference/stop-words/interfaces";

// ── Public types ─────────────────────────────────────────────────────────────

export interface ClinicalRuntimeParserStores {
	profiles: ParserProfileCoreStore;
	profileTags: ProfileTagStore;
	attributeRules: ParserAttributeRuleStore;
	evaluatorRules: ParserEvaluatorRuleStore;
	attributeBindings: ParserProfileRuleBindingStore;
	evaluatorBindings: ParserProfileEvaluatorBindingStore;
	tags: TagStore;
	conceptDefaults: NewParserConceptDefaultStore;
	jurisdictionalDisplays: JurisdictionalDisplayStore;
	stopWordProfiles: StopWordStore;
	proseTemplates: ClinicalProseTemplateStore;
	proseParserTemplates: ProseParserTemplateStore;
	calibration: CalibrationExceptionStore;
	personnel: PersonnelStore;
	facilities: FacilityStore;
	sharedFieldAnchors: SharedFieldAnchorStore;
}

export interface ClinicalRuntime {
	config: ClinicalStoreConfig;
	parserStores: ClinicalRuntimeParserStores;
	learningStores: ParsedCellStore[];
	orderedLearningStores: OrderedLearningStore[];
	autocompleteTransitionStores: AutocompleteTransitionStore[];
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
		calibration,
		personnel,
		facilities,
		sharedFieldAnchors,
		stopWordWordLists,
		orderedLearningStores,
		autocompleteTransitionStores,
	] = await Promise.all([
		resolveParserProfileStores(config),
		resolveParserRuleStores(config),
		resolveReferenceStores(config),
		resolveConceptDefaultStore(config),
		resolveCalibrationExceptionStore(config),
		resolvePersonnelStore(config),
		resolveFacilityStore(config),
		resolveSharedFieldAnchorStore(config),
		resolveStopWordWordListStore(config),
		buildOrderedLearningStores(config),
		buildAutocompleteTransitionStores(config),
	]);

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
			jurisdictionalDisplays: refs.jurisdictionalDisplays,
			stopWordProfiles: stopWordStore,
			proseTemplates: refs.proseTemplates,
			proseParserTemplates: refs.proseParserTemplates,
			calibration,
			personnel,
			facilities,
			sharedFieldAnchors,
		},
		learningStores: await buildLearningStores(config),
		orderedLearningStores,
		autocompleteTransitionStores,
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
