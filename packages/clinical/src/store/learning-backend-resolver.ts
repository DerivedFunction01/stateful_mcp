import { Database } from "bun:sqlite";
import type { AdapterLocator, ResourceLocator } from "@stateful-mcp/core";
import { JsonlParsedCellStore } from "./jsonl-parsed-cell-store";
import { MemoryParsedCellStore } from "./parsed-cell-store";
import { SqliteParsedCellStore } from "./sqlite-parsed-cell-store";

// 1. Define clean type guards
export function isMemoryAdapter(locator: AdapterLocator): locator is Extract<AdapterLocator, { name: "memory" }> {
	return locator.name === "memory";
}

export function isSqliteAdapter(locator: AdapterLocator): locator is Extract<AdapterLocator, { name: "sqlite" }> {
	return locator.name === "sqlite";
}

export function isJsonlAdapter(locator: AdapterLocator): locator is Extract<AdapterLocator, { name: "jsonl" }> {
	return locator.name === "jsonl";
}

export function isOpfsSqliteAdapter(locator: AdapterLocator): locator is Extract<AdapterLocator, { name: "opfs-sqlite" }> {
	return locator.name === "opfs-sqlite";
}

// 2. Use them inside the resolver
export function resolveParsedCellStoreLocator(
	locator: ResourceLocator,
): MemoryParsedCellStore | SqliteParsedCellStore | JsonlParsedCellStore {
	if (locator._type !== "adapter") {
		throw new Error(`Unsupported clinical learning locator type: ${locator._type}`);
	}

	// Inside each if-block, 'locator' narrows perfectly to the exact type
	if (isMemoryAdapter(locator)) {
		return new MemoryParsedCellStore();
	}

	if (isSqliteAdapter(locator)) {
		const dbPath = locator.options?.path ?? "./clinical-learning.sqlite";
		return new SqliteParsedCellStore(new Database(dbPath));
	}

	if (isJsonlAdapter(locator)) {
		const basePath = locator.options?.path ?? "./clinical-learning.jsonl";
		return new JsonlParsedCellStore(basePath);
	}

	if (isOpfsSqliteAdapter(locator)) {
		return new MemoryParsedCellStore();
	}

	throw new Error(`Unsupported clinical learning adapter: ${locator.name}`);
}