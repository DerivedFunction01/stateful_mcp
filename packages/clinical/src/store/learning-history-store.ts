import {
	type ClinicalStorageAdapterConfig,
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "./adapter-config";
import { resolveParsedCellStoreLocator } from "./learning-backend-resolver";
import type {
	ParsedCellHistoryAdapter,
	ParsedCellHistoryStore,
} from "./parsed-cell-store";
import { CompositeParsedCellHistoryStore } from "./parsed-cell-store";

function pickStore(
	config: ClinicalStorageAdapterConfig,
): ParsedCellHistoryStore {
	for (const locator of [config.primary, ...(config.fallbacks || [])]) {
		try {
			return resolveParsedCellStoreLocator(locator);
		} catch {}
	}
	throw new Error(`No usable learning backend found for group ${config.group}`);
}

export function buildLearningHistoryStore(
	registry: ClinicalStorageAdapterRegistry,
): ParsedCellHistoryStore {
	const configs = getClinicalAdapterConfigs("learning", registry);
	const adapters: ParsedCellHistoryAdapter[] = configs.map((config, index) => ({
		adapterId: `${config.group}:${index}`,
		weight: 1 / Math.max(1, configs.length),
		store: pickStore(config),
	}));
	return adapters.length > 1
		? new CompositeParsedCellHistoryStore(adapters)
		: adapters[0]?.store || new CompositeParsedCellHistoryStore([]);
}
