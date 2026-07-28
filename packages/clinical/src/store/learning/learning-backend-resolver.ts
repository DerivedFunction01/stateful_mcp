import type {
	KvBackend,
	ResourceLocator,
	SqlDialect,
} from "@stateful-mcp/core";
import {
	IndexedDbKvBackend,
	JsonlKvBackend,
	LocalStorageKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import { readStringOption, resolveDbPath } from "../sql/resolve-db-path";
import type { ParsedCellStore } from "./interfaces";
import { KvBackendFieldWeightStore } from "./parsed_cell/field-weight-store";
import { KvParsedCellStore } from "./parsed_cell/kv-parsed-cell-store";
import { SqlParsedCellStore } from "./parsed_cell/sql-parsed-cell-store";

async function resolveKvBackendFromLocator(
	locator: ResourceLocator,
): Promise<KvBackend> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical learning locator type for weights: ${locator._type}`,
		);
	}
	const name = locator.name;
	switch (name) {
		case "jsonl": {
			const basePath = readStringOption(
				locator,
				"path",
				"./clinical-learning-weights.jsonl",
			);
			return new JsonlKvBackend({ dataFilePath: basePath });
		}
		case "indexeddb": {
			const dbName = readStringOption(
				locator,
				"dbName",
				"clinical-learning-weights-db",
			);
			return new IndexedDbKvBackend({ dbName });
		}
		case "localstorage": {
			const prefix = readStringOption(
				locator,
				"prefix",
				"clinical-learning-weights",
			);
			return new LocalStorageKvBackend({ prefix });
		}
		default:
			return new MemoryKvBackend();
	}
}

export async function resolveParsedCellStoreLocatorV2(
	locator: ResourceLocator,
	weightsLocator?: ResourceLocator,
): Promise<ParsedCellStore> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical learning locator type: ${locator._type}`,
		);
	}
	const name = locator.name;

	if (["sqlite", "duckdb", "postgres", "opfs"].includes(name)) {
		const connectionTarget = resolveDbPath(
			locator,
			name as SqlDialect,
			name === "postgres"
				? "postgres://localhost:5432/clinical_learning"
				: `./clinical-learning.${name === "duckdb" ? "duckdb" : "sqlite"}`,
		);

		const backend = await SqlBackend.connect(
			name as SqlDialect,
			connectionTarget,
		);

		const fieldWeightStore = weightsLocator
			? new KvBackendFieldWeightStore(
					await resolveKvBackendFromLocator(weightsLocator),
				)
			: undefined;

		return new SqlParsedCellStore(
			name as SqlDialect,
			new SqlExecutor(backend),
			undefined,
			undefined,
			fieldWeightStore,
		);
	}

	if (["memory", "jsonl", "indexeddb", "localstorage"].includes(name)) {
		const kvBackend = await resolveKvBackendFromLocator(locator);

		const fieldWeightStore = weightsLocator
			? new KvBackendFieldWeightStore(
					await resolveKvBackendFromLocator(weightsLocator),
				)
			: new KvBackendFieldWeightStore(kvBackend);

		return new KvParsedCellStore(kvBackend, fieldWeightStore);
	}

	throw new Error(`Unsupported clinical learning adapter: ${name}`);
}
