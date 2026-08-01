import type { ResourceLocator, SqlDialect } from "@stateful-mcp/core";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	readStringOption,
	resolveDbPath,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { ClinicalStoreConfig } from "../clinical-config";
import { KvNotebookStore } from "./kv-notebook-store";
import type { NotebookStore } from "./notebook-store";
import { SqlNotebookStore } from "./sql-notebook-store";

function getPrimaryLocator(
	config: ClinicalStoreConfig,
	group: string,
): ResourceLocator {
	const domain = config.domains[group];
	if (!domain?.defaultAdapters?.[0]?.primary) {
		throw new Error(`No primary adapter configured for domain: ${group}`);
	}
	return domain.defaultAdapters[0].primary;
}

export async function resolveNotebookStore(
	config: ClinicalStoreConfig,
): Promise<NotebookStore> {
	const locator = getPrimaryLocator(config, "notebook");

	if (locator._type !== "adapter") {
		throw new Error(`Unsupported notebook locator type: ${locator._type}`);
	}

	switch (locator.name) {
		case "memory":
			return new KvNotebookStore(new MemoryKvBackend());
		case "jsonl": {
			const path = readStringOption(locator, "path", "") || "notebooks.jsonl";
			return new KvNotebookStore(new JsonlKvBackend({ dataFilePath: path }));
		}
		case "sqlite":
		case "postgres":
		case "duckdb":
		case "opfs": {
			const dialect = locator.name as SqlDialect;
			const backend = await SqlBackend.connect(
				dialect,
				resolveDbPath(locator, dialect, "notebooks"),
			);
			return new SqlNotebookStore(dialect, new SqlExecutor(backend));
		}
		default:
			throw new Error(
				`Unsupported notebook adapter: ${(locator as any).name ?? locator._type}`,
			);
	}
}
