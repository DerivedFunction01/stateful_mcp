import {
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "./adapter-config";
import type { ClinicalStoreConfig } from "./clinical-config";
import type { ParsedCellStore } from "./learning/interfaces";
import { resolveParsedCellStoreLocatorV2 } from "./learning/learning-backend-resolver";
import type { ParserConceptDefaultStore as NewParserConceptDefaultStore } from "./parser/concept_defaults/interfaces";
import {
	resolveCalibrationExceptionStore,
	resolveConceptDefaultStore,
	resolveFacilityStore,
	resolveParserProfileStores,
	resolveParserRuleStores,
	resolvePersonnelStore,
	resolveReferenceStores,
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
import type { ClinicalProseTemplateStore } from "./reference/prose-templates/interfaces";
import type { StopWordProfileStore } from "./reference/stop-words/interfaces";

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
	stopWordProfiles: StopWordProfileStore;
	proseTemplates: ClinicalProseTemplateStore;
	calibration: CalibrationExceptionStore;
	personnel: PersonnelStore;
	facilities: FacilityStore;
}

export interface ClinicalRuntime {
	config: ClinicalStoreConfig;
	parserStores: ClinicalRuntimeParserStores;
	learningStores: ParsedCellStore[];
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
	] = await Promise.all([
		resolveParserProfileStores(config),
		resolveParserRuleStores(config),
		resolveReferenceStores(config),
		resolveConceptDefaultStore(config),
		resolveCalibrationExceptionStore(config),
		resolvePersonnelStore(config),
		resolveFacilityStore(config),
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
			stopWordProfiles: refs.stopWordProfiles,
			proseTemplates: refs.proseTemplates,
			calibration,
			personnel,
			facilities,
		},
		learningStores: await buildLearningStores(config),
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
			.map((a) => resolveParsedCellStoreLocatorV2(a.primary)),
	);
}
