/**
 * SQL dialect configuration for parameter binding, JSON handling, and schema DDL.
 *
 * Each dialect encapsulates the differences between SQLite, Postgres, and DuckDB
 * so the generic store and SQL backend can remain dialect-agnostic.
 */

export type ParamStyle = "?" | "$";

/**
 * Describes how a SQL dialect handles parameters, JSON, and schema initialization.
 */
export interface SqlDialect {
	/** Parameter placeholder style: positional `?` or named `$1` */
	paramStyle: ParamStyle;

	/**
	 * Build a parameter placeholder for the given 1-based index.
	 * For `?` style this always returns `?`.
	 * For `$` style this returns `$1`, `$2`, etc.
	 */
	param(index: number): string;

	/**
	 * Express a JSON parse operation in this dialect.
	 * - Postgres: native JSONB needs no parse
	 * - SQLite/DuckDB: `JSON.parse(?)` or `JSON.parse(col)`
	 */
	jsonParse(column: string): string;

	/**
	 * Express a JSON stringify operation in this dialect.
	 * - Postgres: pass JS object directly to JSONB
	 * - SQLite/DuckDB: `JSON.stringify(?)`
	 */
	jsonStringify(expression: string): string;

	/**
	 * Ordered list of DDL statements to initialize this dialect's schema.
	 * These are pre-compiled SQL strings from `store-schema.ts`.
	 */
	ddl: string[];
}

/**
 * SQLite dialect: uses `?` parameters and text columns for JSON.
 */
export const sqliteDialect: SqlDialect = {
	paramStyle: "?",
	param: (_index: number) => "?",
	jsonParse: (column: string) => `JSON.parse(${column})`,
	jsonStringify: (expression: string) => `JSON.stringify(${expression})`,
	ddl: [],
};

/**
 * Postgres dialect: uses `$N` parameters and native JSONB columns.
 */
export const postgresDialect: SqlDialect = {
	paramStyle: "$",
	param: (index: number) => `$${index}`,
	jsonParse: (column: string) => column, // JSONB arrives pre-parsed
	jsonStringify: (expression: string) => expression, // JSONB accepts JS objects
	ddl: [],
};

/**
 * DuckDB dialect: uses `$N` parameters and text columns for JSON.
 */
export const duckdbDialect: SqlDialect = {
	paramStyle: "$",
	param: (index: number) => `$${index}`,
	jsonParse: (column: string) => `JSON.parse(${column})`,
	jsonStringify: (expression: string) => `JSON.stringify(${expression})`,
	ddl: [],
};

/**
 * Resolve the correct dialect for a given backend type string.
 */
export function getDialect(
	backendType: "sqlite" | "pg" | "duckdb",
): SqlDialect {
	switch (backendType) {
		case "sqlite":
			return sqliteDialect;
		case "pg":
			return postgresDialect;
		case "duckdb":
			return duckdbDialect;
	}
}
