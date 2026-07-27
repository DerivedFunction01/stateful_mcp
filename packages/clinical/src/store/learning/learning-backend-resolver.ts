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
import type { ParsedCellStore } from "./interfaces";
import { KvParsedCellStore } from "./parsed_cell/kv-parsed-cell-store";
import { SqlParsedCellStore } from "./parsed_cell/sql-parsed-cell-store";

function readStringOption(
	locator: ResourceLocator,
	key: "path" | "dbName" | "connectionString" | "prefix",
	fallback: string,
): string {
	if (locator._type !== "adapter") return fallback;
	const options = locator.options as Record<string, unknown> | undefined;
	const value = options?.[key];
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

export async function resolveParsedCellStoreLocatorV2(
	locator: ResourceLocator,
): Promise<ParsedCellStore> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical learning locator type: ${locator._type}`,
		);
	}
	const name = locator.name;
	// 1. Handle SQL Backends
	if (["sqlite", "duckdb", "postgres", "opfs"].includes(name)) {
		let connectionTarget = "";

		if (name === "sqlite" || name === "duckdb") {
			connectionTarget =
				readStringOption(locator, "path", "") ||
				readStringOption(locator, "dbName", "") ||
				`./clinical-learning.${name === "duckdb" ? "duckdb" : "sqlite"}`;
		} else if (name === "postgres") {
			connectionTarget = readStringOption(
				locator,
				"connectionString",
				"postgres://localhost:5432/clinical_learning",
			);
		}

		const backend = await SqlBackend.connect(
			name as SqlDialect,
			connectionTarget,
		);
		return new SqlParsedCellStore(name as SqlDialect, new SqlExecutor(backend));
	}

	// 2. Handle Key-Value (KV) Backends
	if (["memory", "jsonl", "indexeddb", "localstorage"].includes(name)) {
		let kvBackend: KvBackend;

		switch (locator.name) {
			case "jsonl": {
				const basePath = readStringOption(
					locator,
					"path",
					"./clinical-learning.jsonl",
				);
				kvBackend = new JsonlKvBackend({ dataFilePath: basePath });
				break;
			}
			case "indexeddb": {
				const dbName = readStringOption(
					locator,
					"dbName",
					"clinical-learning-db",
				);
				kvBackend = new IndexedDbKvBackend({ dbName });
				break;
			}
			case "localstorage": {
				const prefix = readStringOption(locator, "prefix", "clinical-learning");
				kvBackend = new LocalStorageKvBackend({ prefix });
				break;
			}
			default:
				// Fallback or explicit memory setup
				kvBackend = new MemoryKvBackend();
				break;
		}

		return new KvParsedCellStore(kvBackend);
	}

	throw new Error(`Unsupported clinical learning adapter: ${locator.name}`);
}
