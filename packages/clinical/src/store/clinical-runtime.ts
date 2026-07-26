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
import {
	resolveOrderedLearningStoreLocator,
	resolveParsedCellStoreLocator,
} from "./learning/learning-backend-resolver";
import type { KvOrderedLearningStore } from "./learning/ordered_learning/kv-ordered-learning-store";
import type { SqlOrderedLearningStore } from "./learning/ordered_learning/sql-ordered-learning-store";
import type { KvParsedCellStore } from "./learning/parsed_cell/kv-parsed-cell-store";
import type { SqlParsedCellStore } from "./learning/parsed_cell/sql-parsed-cell-store";

// ── Public types ─────────────────────────────────────────────────────────────

export interface ClinicalRuntimeParserStores {
	profiles: ParserProfileStore;
	conceptDefaults: ParserConceptDefaultStore;
}

export type ResolvedParsedCellStore = KvParsedCellStore | SqlParsedCellStore;

export type ResolvedOrderedLearningStore =
	| KvOrderedLearningStore
	| SqlOrderedLearningStore;

export interface ClinicalRuntime {
	config: ClinicalStoreConfig;
	parserStores: ClinicalRuntimeParserStores;
	learningStores: ResolvedParsedCellStore[];
	orderAwareStores: ResolvedOrderedLearningStore[];
}

// ── Factory functions ────────────────────────────────────────────────────────

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

async function buildOrderedLearningStores(
	config: ClinicalStoreConfig,
): Promise<ResolvedOrderedLearningStore[]> {
	const adapters = getClinicalAdapterConfigs("ordered_learning", {
		ordered_learning: config.domains.ordered_learning.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return await Promise.all(
		adapters
			.filter((a) => a.implemented !== false && a.primary)
			.map((a) => resolveOrderedLearningStoreLocator(a.primary)),
	);
}

async function buildLearningStores(
	config: ClinicalStoreConfig,
): Promise<ResolvedParsedCellStore[]> {
	const adapters = getClinicalAdapterConfigs("learning", {
		learning: config.domains.learning.defaultAdapters,
	} as unknown as ClinicalStorageAdapterRegistry);

	return await Promise.all(
		adapters
			.filter((a) => a.implemented !== false && a.primary)
			.map((a) => resolveParsedCellStoreLocator(a.primary)),
	);
}

export async function createClinicalRuntime(
	config: ClinicalStoreConfig,
): Promise<ClinicalRuntime> {
	return {
		config,
		parserStores: {
			profiles: new ClinicalParserProfileStore(
				{
					get: async (id: string) => {
						const profile = config.seeds.parserProfiles.find(
							(p) => p.profileId === id,
						);
						return profile ?? null;
					},
					list: async () => [...config.seeds.parserProfiles],
					set: async (_id: string, _value: ParserSyntaxProfile) => {},
					delete: async (_id: string) => {},
				} as EntityStore<ParserSyntaxProfile>,
				config.seeds.parserProfiles,
			),
			conceptDefaults: new ClinicalParserConceptDefaultStore(
				{
					get: async (key: string) => {
						const record = config.seeds.conceptDefaults.find(
							(d) => `${d.anchorConceptId}:${d.targetSchema}` === key,
						);
						return record ?? null;
					},
					list: async () => [...config.seeds.conceptDefaults],
					set: async (_key: string, _value: ParserConceptDefault) => {},
					delete: async (_key: string) => {},
				} as EntityStore<ParserConceptDefault>,
				config.seeds.conceptDefaults,
			),
		},
		learningStores: await buildLearningStores(config),
		orderAwareStores: await buildOrderedLearningStores(config),
	};
}
