/**
 * Minimal backend abstraction for storage adapters.
 *
 * This interface captures only the storage primitives needed by the generic
 * store orchestrator, keeping business logic backend-agnostic.
 */

/**
 * Core storage backend contract.
 *
 * Implementations may wrap SQL databases, in-memory maps, or file-backed
 * append-only logs. The generic store only uses these four methods.
 */
export interface StorageBackend {
	/**
	 * Execute a statement that does not return rows (INSERT, UPDATE, DELETE, DDL).
	 */
	exec(sql: string, params: any[]): Promise<void>;

	/**
	 * Execute a query and return all matching rows as plain objects.
	 */
	query(sql: string, params: any[]): Promise<any[]>;

	/**
	 * Wrap a sequence of backend operations in a transaction when the backend
	 * supports atomicity. Memory and JSONL backends may no-op this.
	 */
	transaction<T>(fn: () => Promise<T>): Promise<T>;

	/**
	 * Convert a backend-specific row into a plain JavaScript object.
	 *
	 * This isolates the generic store from DB-specific typing behaviors:
	 * - DuckDB requires `String()`/`Number()` coercion
	 * - SQLite returns `any` via `as any`
	 * - PG returns native JS types already
	 * - Memory/JSONL pass through unchanged
	 */
	coerceRow(row: any): any;
}

/**
 * Optional extension for SQL backends that need to expose their raw
 * connection or pool for schema initialization.
 */
export interface SqlBackend extends StorageBackend {
	getRawConnection(): any;
}

/**
 * Optional extension for non-SQL backends that have lifecycle hooks
 * such as lazy file loading or write serialization.
 */
export interface SimpleBackend extends StorageBackend {
	init?(): Promise<void>;
	serialize?(): Promise<void>;
}
