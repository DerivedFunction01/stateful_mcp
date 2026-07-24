import { Database } from "bun:sqlite";
import type { ResourceLocator } from "@stateful-mcp/core";
import { JsonlParsedCellStore } from "./jsonl-parsed-cell-store";
import { MemoryOrderedLearningStore } from "./ordered-learning-store";
import { MemoryParsedCellStore } from "./parsed-cell-store";
import { SqliteParsedCellStore } from "./sqlite-parsed-cell-store";

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

export function resolveParsedCellStoreLocator(
	locator: ResourceLocator,
): MemoryParsedCellStore | SqliteParsedCellStore | JsonlParsedCellStore {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported clinical learning locator type: ${locator._type}`,
		);
	}

	if (locator.name === "memory") {
		return new MemoryParsedCellStore();
	}

	if (locator.name === "sqlite") {
		const dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			"./clinical-learning.sqlite";
		return new SqliteParsedCellStore(new Database(dbPath));
	}

	if (locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-learning.jsonl";
		return new JsonlParsedCellStore(basePath);
	}

	if (locator.name === "opfs-sqlite") {
		return new MemoryParsedCellStore();
	}

	throw new Error(`Unsupported clinical learning adapter: ${locator.name}`);
}

export function resolveOrderedLearningStoreLocator(
	locator: ResourceLocator,
): MemoryOrderedLearningStore {
	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported ordered learning locator type: ${locator._type}`,
		);
	}

	if (locator.name === "memory") {
		return new MemoryOrderedLearningStore();
	}

	// sqlite, duckdb, postgres adapters will be added in Phase 2 (SQL adapter plan)
	throw new Error(
		`Unsupported ordered learning adapter: ${locator.name}. Only "memory" is implemented in Phase 1.`,
	);
}
