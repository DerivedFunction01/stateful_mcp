import type { ResourceLocator } from "@stateful-mcp/core";
import type {
	AttributeParserRule,
	ConceptFieldRule,
	DateTimeFormatConfig,
	ParserConceptDefault,
	ParserDictionaryRule,
	ParserSyntaxProfile,
} from "./interfaces";

export type ClinicalStoreDomain =
	| "learning"
	| "ordered_learning"
	| "dictionary"
	| "parser"
	| "soap_note"
	| "patient_store"
	| "concept_fields"
	| (string & {});

export type ClinicalStoreCapability =
	| "read"
	| "write"
	| "query"
	| "rank"
	| "learn"
	| "seed"
	| "resolve"
	| "compile"
	| (string & {});

export interface ClinicalStoreBackendConfig {
	group: ClinicalStoreDomain;
	capabilities?: ClinicalStoreCapability[];
	primary: ResourceLocator;
	weights?: ResourceLocator;
	fallbacks?: ResourceLocator[];
	implemented?: boolean;
	metadata?: Record<string, unknown>;
}

export interface ClinicalStoreDomainConfig {
	group: ClinicalStoreDomain;
	implemented?: boolean;
	description?: string;
	defaultAdapters: ClinicalStoreBackendConfig[];
}

export interface ClinicalStoreConfig {
	version: 1;
	domains: Record<ClinicalStoreDomain, ClinicalStoreDomainConfig>;
	seeds: {
		parserProfiles: ParserSyntaxProfile[];
		conceptDefaults: ParserConceptDefault[];
		conceptFieldRules: ConceptFieldRule[];
		calendarDateFormats: DateTimeFormatConfig[];
		attributeRules: AttributeParserRule[];
		evaluatorRules: ParserDictionaryRule[];
	};
	extensions?: Record<string, unknown>;
}
