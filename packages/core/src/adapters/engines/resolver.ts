import { resolveSource } from "../../config/loader";
import type { ResourceLocator } from "../../config/types";
import type { KvBackend } from "../storage/generic/kv/KvBackend";
import { SqlBackend } from "../storage/sql/backend";
import type { QueryEngine } from "./interfaces";
import { KvQueryEngine } from "./kv-query";
import { SqlQueryEngine } from "./sql-query";

export async function resolveQueryEngine(
	locator: ResourceLocator,
	workspaceRoot: string,
): Promise<QueryEngine> {
	const resolved = await resolveSource(locator, workspaceRoot);

	if (resolved instanceof SqlBackend) {
		return new SqlQueryEngine(resolved);
	}

	// If resolved object conforms to KvBackend interface
	if (
		resolved &&
		typeof resolved === "object" &&
		"load" in resolved &&
		"set" in resolved
	) {
		return new KvQueryEngine(resolved as KvBackend);
	}

	if (
		resolved &&
		typeof resolved === "object" &&
		"execute" in resolved &&
		typeof (resolved as any).execute === "function"
	) {
		return resolved as QueryEngine;
	}

	throw new Error(
		`Unsupported query engine backend target: ${locator._type} (${(locator as any).name})`,
	);
}
