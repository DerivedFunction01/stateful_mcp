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
import type { NgramStore } from "../interfaces";
import { KvNgramStore } from "./kv-ngram-store";
import { SqlNgramStore } from "./sql-ngram-store";

async function resolveKvBackendFromLocator(
	locator: ResourceLocator,
): Promise<KvBackend> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical autocomplete locator type: ${locator._type}`,
		);
	}
	const name = locator.name;
	switch (name) {
		case "jsonl": {
			const basePath = readStringOption(
				locator,
				"path",
				"./clinical-autocomplete.jsonl",
			);
			return new JsonlKvBackend({ dataFilePath: basePath });
		}
		case "indexeddb": {
			const dbName = readStringOption(
				locator,
				"dbName",
				"clinical-autocomplete-db",
			);
			return new IndexedDbKvBackend({ dbName });
		}
		case "localstorage": {
			const prefix = readStringOption(
				locator,
				"prefix",
				"clinical-autocomplete",
			);
			return new LocalStorageKvBackend({ prefix });
		}
		default:
			return new MemoryKvBackend();
	}
}

export async function resolveNgramStoreLocator(
	locator: ResourceLocator,
): Promise<NgramStore> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical autocomplete locator type: ${locator._type}`,
		);
	}
	const name = locator.name;

	if (["sqlite", "duckdb", "postgres", "opfs"].includes(name)) {
		const connectionTarget = resolveDbPath(
			locator,
			name as SqlDialect,
			name === "postgres"
				? "postgres://localhost:5432/clinical_autocomplete"
				: `./clinical-autocomplete.${name === "duckdb" ? "duckdb" : "sqlite"}`,
		);

		const backend = await SqlBackend.connect(
			name as SqlDialect,
			connectionTarget,
		);

		return new SqlNgramStore(name as SqlDialect, new SqlExecutor(backend));
	}

	if (["memory", "jsonl", "indexeddb", "localstorage"].includes(name)) {
		const kvBackend = await resolveKvBackendFromLocator(locator);
		return new KvNgramStore(kvBackend);
	}

	throw new Error(`Unsupported clinical autocomplete adapter: ${name}`);
}
