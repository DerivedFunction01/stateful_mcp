import {
	type ClinicalStorageAdapterConfig,
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "../adapter-config";
import { resolveParsedCellStoreLocator } from "./learning-backend-resolver";
import type {
	ParsedCellHistoryAdapter,
	ParsedCellHistoryStore,
} from "./parsed_cell/history-store";
import { CompositeParsedCellHistoryStore } from "./parsed_cell/history-store";

async function pickStore(
	config: ClinicalStorageAdapterConfig,
): Promise<ParsedCellHistoryStore> {
	for (const locator of [config.primary, ...(config.fallbacks || [])]) {
		try {
			return await resolveParsedCellStoreLocator(locator);
		} catch {}
	}
	throw new Error(`No usable learning backend found for group ${config.group}`);
}

export async function buildLearningHistoryStore(
	registry: ClinicalStorageAdapterRegistry,
): Promise<ParsedCellHistoryStore> {
	const configs = getClinicalAdapterConfigs("learning", registry);
	const adapters: ParsedCellHistoryAdapter[] = await Promise.all(
		configs.map(async (config, index) => ({
			adapterId: `${config.group}:${index}`,
			weight: 1 / Math.max(1, configs.length),
			store: await pickStore(config),
		})),
	);
	return new CompositeParsedCellHistoryStore(adapters);
}
