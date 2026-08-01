/**
 * TEST/FIXTURE DEFAULTS ONLY — NOT FOR RUNTIME USE.
 *
 * ⚠️  This module is intentionally for prototype tests, mock fixtures, and
 *    local bootstrap data only. It is NOT the runtime source of truth.
 *
 * Production and long-lived clinical behavior MUST load from config-backed
 * stores/adapters instead of importing these values directly.
 *
 * For runtime usage:
 *   - Use `clinical-loader.ts` → `buildClinicalRuntime()` to resolve config
 *   - Use `CdslParser.create()` to resolve profiles from store, not seed arrays
 *
 * Existing direct imports are allowed only in test files and/or legacy
 * code paths that have not yet migrated to config-backed injection.
 */
import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_CALENDAR_DATE_FORMATS,
	DEFAULT_EVALUATOR_RULES,
	DEFAULT_STOP_WORD_LISTS,
	DEFAULT_STOP_WORD_PROFILES,
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
		shared_field_anchors: {
			group: "shared_field_anchors",
			implemented: true,
			description: "Post-parse shared field anchor rules.",
			defaultAdapters: [
				{
					group: "shared_field_anchors",
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
		parser_macros: {
			group: "parser_macros",
			implemented: true,
			description: "Parser macro definition and expansion backends.",
			defaultAdapters: [
				{
					group: "parser_macros",
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
							path: "./clinical-ordered-learning.sqlite",
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
							path: "./clinical-ordered-learning.jsonl",
						},
					},
					implemented: false,
				},
			],
		},
		autocomplete: {
			group: "autocomplete",
			implemented: true,
			description:
				"Autocomplete transition store for slot-to-slot navigation patterns. Tracks form field transitions with decayed and continuous aggregates.",
			defaultAdapters: [
				{
					group: "autocomplete",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "sqlite",
						options: {
							path: "./clinical-autocomplete.sqlite",
						},
					},
					implemented: true,
				},
				{
					group: "autocomplete",
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
					group: "autocomplete",
					capabilities: ["read", "write", "query", "rank", "learn"],
					primary: {
						_type: "adapter",
						name: "jsonl",
						options: {
							path: "./clinical-autocomplete.jsonl",
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
		signed_note: {
			group: "signed_note",
			implemented: true,
			description:
				"Immutable signed SOAP note archive with full event log for replayability.",
			defaultAdapters: [
				{
					group: "signed_note",
					capabilities: ["read", "write", "query"],
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
		cell: {
			group: "cell",
			implemented: true,
			description:
				"Cell state persistence for cell context, parent resolution, and link target resolution.",
			defaultAdapters: [
				{
					group: "cell",
					capabilities: ["read", "write", "query"],
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
		notebook: {
			group: "notebook",
			implemented: true,
			description:
				"Durable notebook session document store — cell order, content, active index, and draft text.",
			defaultAdapters: [
				{
					group: "notebook",
					capabilities: ["read", "write", "query"],
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
	},
	seeds: {
		parserProfiles: SEED_PARSER_PROFILES,
		conceptDefaults: SEED_CONCEPT_DEFAULTS,
		conceptFieldRules: SEED_CONCEPT_FIELD_RULES,
		calendarDateFormats: DEFAULT_CALENDAR_DATE_FORMATS,
		attributeRules: DEFAULT_ATTRIBUTE_RULES,
		evaluatorRules: DEFAULT_EVALUATOR_RULES,
		stopWordLists: DEFAULT_STOP_WORD_LISTS,
		stopWordProfiles: DEFAULT_STOP_WORD_PROFILES,
	},
	extensions: {},
};