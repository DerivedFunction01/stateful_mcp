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
import type { CellStore } from "../interfaces";
import { KvCellStore } from "./kv-cell-store";
import { SqlCellStore } from "./sql-cell-store";

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

export async function resolveCellStore(
	config: ClinicalStoreConfig,
): Promise<CellStore> {
	const locator = getPrimaryLocator(config, "cell");

	if (locator._type !== "adapter") {
		throw new Error(`Unsupported cell locator type: ${locator._type}`);
	}

	switch (locator.name) {
		case "memory":
			return new KvCellStore(new MemoryKvBackend());
		case "jsonl": {
			const path =
				readStringOption(locator, "path", "") || "cells.jsonl";
			return new KvCellStore(
				new JsonlKvBackend({ dataFilePath: path }),
			);
		}
		case "sqlite":
		case "postgres":
		case "duckdb":
		case "opfs": {
			const dialect = locator.name as SqlDialect;
			const backend = await SqlBackend.connect(
				dialect,
				resolveDbPath(locator, dialect, "cells"),
			);
			return new SqlCellStore(dialect, new SqlExecutor(backend));
		}
		default:
			throw new Error(
				`Unsupported cell adapter: ${(locator as any).name ?? locator._type}`,
			);
	}
}