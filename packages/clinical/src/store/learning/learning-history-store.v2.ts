import type { ResourceLocator } from "@stateful-mcp/core";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import {
	type ClinicalStorageAdapterConfig,
	type ClinicalStorageAdapterRegistry,
	getClinicalAdapterConfigs,
} from "../adapter-config";
import type {
	ParsedCellHistoryAdapter,
	ParsedCellHistoryStore,
} from "./parsed_cell/history-store.v2";
import { CompositeParsedCellHistoryStore } from "./parsed_cell/history-store.v2";
import { KvParsedCellStore } from "./parsed_cell/kv-parsed-cell-store.v2";
import { SqlParsedCellStore } from "./parsed_cell/sql-parsed-cell-store.v2";

function readStringOption(
	locator: ResourceLocator,
	key: "path" | "dbName",
	fallback: string,
): string {
	if (locator._type !== "adapter") return fallback;
	const options = locator.options as Record<string, unknown> | undefined;
	const value = options?.[key];
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

export async function resolveParsedCellStoreLocatorV2(
	locator: ResourceLocator,
): Promise<KvParsedCellStore | SqlParsedCellStore> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical learning locator type: ${locator._type}`,
		);
	}

	if (locator.name === "memory") {
		return new KvParsedCellStore(new MemoryKvBackend());
	}

	if (locator.name === "sqlite") {
		const dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			"./clinical-learning.sqlite";
		const backend = await SqlBackend.connect("sqlite", dbPath);
		return new SqlParsedCellStore("sqlite", new SqlExecutor(backend));
	}

	if (locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-learning.jsonl";
		return new KvParsedCellStore(
			new JsonlKvBackend({ dataFilePath: basePath }),
		);
	}

	if (locator.name === "opfs") {
		return new KvParsedCellStore(new MemoryKvBackend());
	}

	throw new Error(`Unsupported clinical learning adapter: ${locator.name}`);
}

async function pickStore(
	config: ClinicalStorageAdapterConfig,
): Promise<ParsedCellHistoryStore> {
	for (const locator of [config.primary, ...(config.fallbacks || [])]) {
		try {
			return await resolveParsedCellStoreLocatorV2(locator);
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
