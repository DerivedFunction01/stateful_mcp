import type { ResourceLocator } from "@stateful-mcp/core";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { OrderedLearningSqlDialect } from "../sql/ordered-learning-query-compiler";
import type { ParsedCellSqlDialect } from "../sql/parsed-cell-query-compiler";
import { KvOrderedLearningStore } from "./ordered_learning/kv-ordered-learning-store";
import { SqlOrderedLearningStore } from "./ordered_learning/sql-ordered-learning-store";
import { KvParsedCellStore } from "./parsed_cell/kv-parsed-cell-store";
import { SqlParsedCellStore } from "./parsed_cell/sql-parsed-cell-store";

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

export async function resolveParsedCellStoreLocator(
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
		return new SqlParsedCellStore(
			"sqlite" as ParsedCellSqlDialect,
			new SqlExecutor(backend),
		);
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

export async function resolveOrderedLearningStoreLocator(
	locator: ResourceLocator,
): Promise<KvOrderedLearningStore | SqlOrderedLearningStore> {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported ordered learning locator type: ${locator._type}`,
		);
	}

	if (locator.name === "memory") {
		return new KvOrderedLearningStore(new MemoryKvBackend());
	}

	if (locator.name === "sqlite") {
		const dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			"./clinical-learning.sqlite";
		const backend = await SqlBackend.connect("sqlite", dbPath);
		return new SqlOrderedLearningStore(
			"sqlite" as OrderedLearningSqlDialect,
			new SqlExecutor(backend),
		);
	}

	throw new Error(
		`Unsupported ordered learning adapter: ${locator.name}. Only "memory" and "sqlite" are implemented.`,
	);
}
