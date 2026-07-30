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
	readStringOption,
	resolveDbPath,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";

import type { OrderedLearningStore } from "./interfaces";
import { KvOrderedLearningStore } from "./ordered_learning/kv-ordered-learning-store";
import { SqlOrderedLearningStore } from "./ordered_learning/sql-ordered-learning-store";

async function resolveKvBackendFromLocator(
	locator: ResourceLocator,
): Promise<KvBackend> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical ordered-learning locator type: ${locator._type}`,
		);
	}
	const name = locator.name;
	switch (name) {
		case "jsonl": {
			const basePath = readStringOption(
				locator,
				"path",
				"./clinical-ordered-learning.jsonl",
			);
			return new JsonlKvBackend({ dataFilePath: basePath });
		}
		case "indexeddb": {
			const dbName = readStringOption(
				locator,
				"dbName",
				"clinical-ordered-learning-db",
			);
			return new IndexedDbKvBackend({ dbName });
		}
		case "localstorage": {
			const prefix = readStringOption(
				locator,
				"prefix",
				"clinical-ordered-learning",
			);
			return new LocalStorageKvBackend({ prefix });
		}
		default:
			return new MemoryKvBackend();
	}
}

export async function resolveOrderedLearningStoreLocator(
	locator: ResourceLocator,
): Promise<OrderedLearningStore> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical ordered-learning locator type: ${locator._type}`,
		);
	}
	const name = locator.name;

	if (["sqlite", "duckdb", "postgres", "opfs"].includes(name)) {
		const connectionTarget = resolveDbPath(
			locator,
			name as SqlDialect,
			name === "postgres"
				? "postgres://localhost:5432/clinical_ordered_learning"
				: `./clinical-ordered-learning.${name === "duckdb" ? "duckdb" : "sqlite"}`,
		);

		const backend = await SqlBackend.connect(
			name as SqlDialect,
			connectionTarget,
		);

		return new SqlOrderedLearningStore(
			name as SqlDialect,
			new SqlExecutor(backend),
		);
	}

	if (["memory", "jsonl", "indexeddb", "localstorage"].includes(name)) {
		const kvBackend = await resolveKvBackendFromLocator(locator);
		return new KvOrderedLearningStore(kvBackend);
	}

	throw new Error(`Unsupported clinical ordered-learning adapter: ${name}`);
}
