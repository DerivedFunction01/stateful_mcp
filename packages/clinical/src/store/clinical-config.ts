import type { ResourceLocator } from "@stateful-mcp/core";
import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_CALENDAR_DATE_FORMATS,
	DEFAULT_EVALUATOR_RULES,
	SEED_CONCEPT_DEFAULTS,
	SEED_PARSER_PROFILES,
} from "./defaults";
import type {
	AttributeParserRule,
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
		calendarDateFormats: DateTimeFormatConfig[];
		attributeRules: AttributeParserRule[];
		evaluatorRules: ParserDictionaryRule[];
	};
	extensions?: Record<string, unknown>;
}

export const DEFAULT_CLINICAL_STORE_CONFIG: ClinicalStoreConfig = {
	version: 1,
	domains: {
		learning: {
			group: "learning",
			implemented: true,
			description:
				"Backend-owned learning history, ranking, and future compaction-aware caches.",
			defaultAdapters: [
				{
					group: "learning",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "sqlite",
						options: {
							path: "./clinical-learning.sqlite",
						},
					},
					fallbacks: [
						{
							_type: "adapter",
							name: "memory",
							options: {
								seed: [],
							},
						},
					],
					implemented: true,
				},
				{
					group: "learning",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "opfs-sqlite",
						options: {
							dbName: "clinical-learning-opfs.sqlite3",
						},
					},
					implemented: false,
				},
				{
					group: "learning",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "jsonl",
						options: {
							path: "./clinical-learning.jsonl",
						},
					},
					implemented: true,
				},
				{
					group: "learning",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "memory",
						options: {
							seed: [],
						},
					},
					implemented: true,
				},
			],
		},
		dictionary: {
			group: "dictionary",
			implemented: false,
			description:
				"Concept and synonym resolution backend, reserved for future adapter-backed dictionaries.",
			defaultAdapters: [],
		},
		parser: {
			group: "parser",
			implemented: true,
			description:
				"Parser profile, concept default, and rule resolution backends.",
			defaultAdapters: [],
		},
		soap_note: {
			group: "soap_note",
			implemented: true,
			description: "Durable SOAP note/document storage and retrieval backends.",
			defaultAdapters: [],
		},
		ordered_learning: {
			group: "ordered_learning",
			implemented: true,
			description:
				"Order-aware learning store for resolved token sequences. Captures and retrieves ordered parse tokens for sequence-based ranking.",
			defaultAdapters: [
				{
					group: "ordered_learning",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "memory",
						options: {
							seed: [],
						},
					},
					implemented: true,
				},
			],
		},
		patient_store: {
			group: "patient_store",
			implemented: true,
			description:
				"Patient and patient-context storage backends, including note-linked context.",
			defaultAdapters: [],
		},
	},
	seeds: {
		parserProfiles: SEED_PARSER_PROFILES,
		conceptDefaults: SEED_CONCEPT_DEFAULTS,
		calendarDateFormats: DEFAULT_CALENDAR_DATE_FORMATS,
		attributeRules: DEFAULT_ATTRIBUTE_RULES,
		evaluatorRules: DEFAULT_EVALUATOR_RULES,
	},
	extensions: {},
};
