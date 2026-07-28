import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_CALENDAR_DATE_FORMATS,
	DEFAULT_EVALUATOR_RULES,
	SEED_CONCEPT_DEFAULTS,
	SEED_CONCEPT_FIELD_RULES,
	SEED_PARSER_PROFILES,
} from "./defaults";
import type { ClinicalStoreConfig } from "../store/clinical-config";

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
						name: "opfs",
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
		parser_profiles: {
			group: "parser_profiles",
			implemented: true,
			description: "Parser profile and profile-tag backends.",
			defaultAdapters: [
				{
					group: "parser_profiles",
					capabilities: ["read", "write"],
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
		parser_rules: {
			group: "parser_rules",
			implemented: true,
			description: "Parser attribute rules, evaluator rules, and bindings.",
			defaultAdapters: [
				{
					group: "parser_rules",
					capabilities: ["read", "write"],
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
		reference: {
			group: "reference",
			implemented: true,
			description:
				"Shared reference data: tags, jurisdictional displays, stop word profiles, prose templates.",
			defaultAdapters: [
				{
					group: "reference",
					capabilities: ["read", "write"],
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
		concept_defaults: {
			group: "concept_defaults",
			implemented: true,
			description: "Concept defaults tied to the dictionary backend config.",
			defaultAdapters: [
				{
					group: "concept_defaults",
					capabilities: ["read", "write"],
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
		concept_fields: {
			group: "concept_fields",
			implemented: true,
			description: "Concept-to-field routing rules.",
			defaultAdapters: [
				{
					group: "concept_fields",
					capabilities: ["read", "write"],
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
		calibration: {
			group: "calibration",
			implemented: true,
			description: "Calibration exception store.",
			defaultAdapters: [
				{
					group: "calibration",
					capabilities: ["read", "write"],
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
		personnel: {
			group: "personnel",
			implemented: true,
			description: "Personnel store.",
			defaultAdapters: [
				{
					group: "personnel",
					capabilities: ["read", "write"],
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
		facilities: {
			group: "facilities",
			implemented: true,
			description: "Facility store.",
			defaultAdapters: [
				{
					group: "facilities",
					capabilities: ["read", "write"],
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
						name: "sqlite",
						options: {
							path: "./clinical-learning.sqlite",
						},
					},
					implemented: true,
				},
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
				{
					group: "ordered_learning",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "jsonl",
						options: {
							path: "./clinical-learning.jsonl",
						},
					},
					implemented: false,
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
		conceptFieldRules: SEED_CONCEPT_FIELD_RULES,
		calendarDateFormats: DEFAULT_CALENDAR_DATE_FORMATS,
		attributeRules: DEFAULT_ATTRIBUTE_RULES,
		evaluatorRules: DEFAULT_EVALUATOR_RULES,
	},
	extensions: {},
};