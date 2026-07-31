export type ClinicalInitSeedKind =
	| "profile"
	| "calendar_vocabulary"
	| "date_pattern"
	| "time_pattern"
	| "relative_time_rule"
	| "range_rule"
	| "cadence_rule"
	| "exclusion_rule"
	| "attribute_rule"
	| "evaluator_rule"
	| "field_rule"
	| "concept_default"
	| "prose_rule"
	| "prose_parser_template"
	| "shared_field_anchor"
	| "stop_word_list"
	| "stop_word_profile"
	| "personnel"
	| "facility"
	| "jurisdictional_display"
	| "macro"
	| "dictionary_expression"
	| "concept_relation"
	| "variation_group";

export interface ClinicalInitSeedRecord {
	recordId: string;
	kind: ClinicalInitSeedKind;
	profileId?: string;
	locale?: string;
	enabled?: boolean;
	requires?: string[];
	variationGroup?: string;
	variationId?: string;
	variationPriority?: number;
	ambiguityPolicy?: "first" | "highest_priority" | "reject" | "collect";
	payload: Record<string, unknown>;
}

export interface ClinicalInitSeedManifest {
	manifestId: string;
	version: number;
	description: string;
	modules: ClinicalInitSeedModuleDescriptor[];
}

export interface ClinicalInitSeedModuleDescriptor {
	moduleId: string;
	version: number;
	requires?: string[];
	kinds: ClinicalInitSeedKind[];
	format: "typed" | "json" | "jsonl";
	load: () => Promise<ClinicalInitSeedRecord[]>;
}

export interface ClinicalInitSeedModule extends ClinicalInitSeedModuleDescriptor {
	loadedAt?: string;
}

export interface ClinicalInitSeedLoadedRecord extends ClinicalInitSeedRecord {
	sourceModuleId: string;
	sourceModuleVersion: number;
}
