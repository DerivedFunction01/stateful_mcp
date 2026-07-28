import type { ResourceLocator } from "../../../config/types";
import type { SqlDialect } from "../../../translation/sql-compiler";

export function readStringOption(
	locator: ResourceLocator,
	key: "path" | "dbName" | "connectionString" | "connection" | "prefix",
	fallback: string,
): string {
	if (locator._type !== "adapter") return fallback;
	const options = locator.options as Record<string, any> | undefined;
	const value = options?.[key];
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function resolveDbPath(
	locator: ResourceLocator,
	dialect: SqlDialect,
	defaultPath = "./clinical.sqlite",
): string {
	let dbPath = "";
	if (dialect === "postgres") {
		dbPath =
			readStringOption(locator, "connectionString", "") ||
			readStringOption(locator, "connection", "") ||
			defaultPath;
	} else {
		dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			defaultPath;
	}

	if (dialect === "duckdb" && locator._type === "adapter") {
		const options = locator.options as Record<string, unknown> | undefined;
		if (options?.schema || options?.views || options?.tables) {
			return JSON.stringify({
				path: dbPath,
				schema: options.schema || options.views || options.tables,
			});
		}
	}

	return dbPath;
}
