import type { EntityStore } from "@stateful-mcp/core";
import {
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "./adapter-config";
import type { ClinicalStoreConfig } from "./clinical-config";
import {
	ClinicalParserConceptDefaultStore,
	ClinicalParserProfileStore,
} from "./clinical-store";
import type {
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserProfileStore,
	ParserSyntaxProfile,
} from "./interfaces";
import type { JsonlParsedCellStore } from "./jsonl-parsed-cell-store";
import {
	resolveOrderedLearningStoreLocator,
	resolveParsedCellStoreLocator,
} from "./learning-backend-resolver";
import type { MemoryOrderedLearningStore } from "./ordered-learning-store";
import type { MemoryParsedCellStore } from "./parsed-cell-store";
import type { SqliteParsedCellStore } from "./sqlite-parsed-cell-store";

// ── Public types ─────────────────────────────────────────────────────────────

export interface ClinicalRuntimeParserStores {
	profiles: ParserProfileStore;
	conceptDefaults: ParserConceptDefaultStore;
}

/**
 * Union of adapter-resolved parsed cell store types.
 *
 * Renamed from `ParsedCellStore` to avoid collision with the
 * `ParsedCellStore` interface in parsed-cell-store.ts.
 */
export type ResolvedParsedCellStore =
	| MemoryParsedCellStore
	| SqliteParsedCellStore
	| JsonlParsedCellStore;

export type ResolvedOrderedLearningStore = MemoryOrderedLearningStore;

export interface ClinicalRuntime {
	config: ClinicalStoreConfig;
	parserStores: ClinicalRuntimeParserStores;
	learningStores: ResolvedParsedCellStore[];
	orderAwareStores: ResolvedOrderedLearningStore[];
}

// ── Factory functions ────────────────────────────────────────────────────────

/**
 * Builds parser stores from config seeds + injected EntityStores.
 *
 * Kept for backward compatibility with existing consumers.
 */
export function buildClinicalParserStores(
	config: ClinicalStoreConfig,
	profileEntityStore: EntityStore<ParserSyntaxProfile>,
	conceptDefaultEntityStore: EntityStore<ParserConceptDefault>,
): ClinicalRuntimeParserStores {
	return {
		profiles: new ClinicalParserProfileStore(
			profileEntityStore,
			config.seeds.parserProfiles,
		),
		conceptDefaults: new ClinicalParserConceptDefaultStore(
			conceptDefaultEntityStore,
			config.seeds.conceptDefaults,
		),
	};
}

/**
 * Builds learning stores from config adapter definitions.
 *
 * Resolves each implemented learning adapter into a ParsedCellStore
 * using the existing learning-backend-resolver registry.
 */
function buildOrderedLearningStores(
	config: ClinicalStoreConfig,
): ResolvedOrderedLearningStore[] {
	const adapters = getClinicalAdapterConfigs("ordered_learning", {
		ordered_learning: config.domains.ordered_learning.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return adapters
		.filter((a) => a.implemented !== false && a.primary)
		.map((a) => resolveOrderedLearningStoreLocator(a.primary));
}

function buildLearningStores(
	config: ClinicalStoreConfig,
): ResolvedParsedCellStore[] {
	const adapters = getClinicalAdapterConfigs("learning", {
		learning: config.domains.learning.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return adapters
		.filter((a) => a.implemented !== false && a.primary)
		.map((a) => resolveParsedCellStoreLocator(a.primary));
}

/**
 * Creates a complete ClinicalRuntime from a ClinicalStoreConfig.
 *
 * This is the primary entrypoint for config-backed runtime construction.
 * Learning stores are composed from the adapter registry (preserving current
 * behavior). Parser profile and concept-default stores are seeded from config.
 *
 * Note: Currently returns learning stores and parser stores directly.
 * In the future, dictionary, expression, and patient stores will be added
 * by extending the config registry, not by reshaping this contract.
 */
export function createClinicalRuntime(
	config: ClinicalStoreConfig,
): ClinicalRuntime {
	return {
		config,
		parserStores: {
			profiles: new ClinicalParserProfileStore(
				// In-memory entity store seeded from config
				// (in production, this would come from an adapter resolver)
				{
					get: async (id: string) => {
						const profile = config.seeds.parserProfiles.find(
							(p) => p.profileId === id,
						);
						return profile ?? null;
					},
					list: async () => [...config.seeds.parserProfiles],
					set: async (_id: string, _value: ParserSyntaxProfile) => {
						// no-op for now — production would delegate to an adapter
					},
					delete: async (_id: string) => {
						// no-op for now
					},
				} as EntityStore<ParserSyntaxProfile>,
				config.seeds.parserProfiles,
			),
			conceptDefaults: new ClinicalParserConceptDefaultStore(
				{
					get: async (key: string) => {
						// key format is "anchorConceptId:targetSchema"
						const record = config.seeds.conceptDefaults.find(
							(d) => `${d.anchorConceptId}:${d.targetSchema}` === key,
						);
						return record ?? null;
					},
					list: async () => [...config.seeds.conceptDefaults],
					set: async (_key: string, _value: ParserConceptDefault) => {
						// no-op for now
					},
					delete: async (_key: string) => {
						// no-op for now
					},
				} as EntityStore<ParserConceptDefault>,
				config.seeds.conceptDefaults,
			),
		},
		learningStores: buildLearningStores(config),
		orderAwareStores: buildOrderedLearningStores(config),
	};
}
