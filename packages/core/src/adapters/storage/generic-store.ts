/**
 * Generic store orchestrators that implement the shared business logic for all
 * session and persistent stores, delegating only storage I/O to a backend.
 *
 * These classes own:
 * - overloaded get/set/delete dispatch
 * - ID generation and alias support during create
 * - findByTag and list with scope filtering
 * - expireSession cleanup
 * - listSession and listChildren
 *
 * They do NOT own:
 * - SQL dialect specifics
 * - transaction implementation details
 * - row coercion
 */

import type { OwnerScope } from "../../config/types";
import type { StorageBackend } from "./backend";
import type { ScopeStrategy, StoreConfig } from "./store-config";

/**
 * Base class for generic session stores.
 *
 * @typeParam TState - The shape of the state object (e.g. FilterState, ObjectState)
 */
export abstract class GenericSessionStore<TState> {
	protected abstract backend: StorageBackend;
	protected abstract config: StoreConfig;

	/**
	 * Create a new session-scoped entity with optional alias.
	 */
	async create(
		sessionId: string,
		state: TState,
		alias?: string,
	): Promise<string> {
		const idField = this.config.idField;
		const providedId = (state as any)[idField];
		const id =
			providedId ??
			`${this.config.idPrefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState = { ...state, [idField]: id } as TState;

		await this.set(sessionId, id, fullState);

		if (alias && this.config.aliasTable) {
			await this.backend.exec(
				`INSERT OR REPLACE INTO ${this.config.aliasTable} (session_id, alias_name, target_id) VALUES (?, ?, ?)`,
				[sessionId, alias, id],
			);
		}

		return id;
	}

	abstract get(sessionId: string, id: string): Promise<TState | null>;
	abstract set(sessionId: string, id: string, state: TState): Promise<void>;
	abstract delete(sessionId: string, id: string): Promise<void>;

	abstract listSession(sessionId: string): Promise<string[]>;
	abstract listChildren(sessionId: string, parentId: string): Promise<string[]>;

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		await this.backend.exec(
			`DELETE FROM ${this.config.tableName} WHERE session_id = ? AND scope_level = 'session'`,
			[sessionId],
		);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		if (!this.config.aliasTable) return null;
		const rows = await this.backend.query(
			`SELECT target_id FROM ${this.config.aliasTable} WHERE session_id = ? AND alias_name = ?`,
			[sessionId, alias],
		);
		return rows[0]?.target_id ?? null;
	}

	async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		if (!this.config.aliasTable) return;
		await this.backend.exec(
			`INSERT OR REPLACE INTO ${this.config.aliasTable} (session_id, alias_name, target_id) VALUES (?, ?, ?)`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		if (!this.config.aliasTable) return;
		await this.backend.exec(
			`DELETE FROM ${this.config.aliasTable} WHERE session_id = ? AND alias_name = ?`,
			[sessionId, alias],
		);
	}

	async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
		if (!this.config.aliasTable) return [];
		const rows = await this.backend.query(
			`SELECT alias_name, target_id FROM ${this.config.aliasTable} WHERE session_id = ?`,
			[sessionId],
		);
		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
	}
}

/**
 * Base class for generic persistent stores.
 *
 * @typeParam TState - The shape of the state object when returned with scope
 */
export abstract class GenericPersistentStore<TState> {
	protected abstract backend: StorageBackend;
	protected abstract config: StoreConfig;

	abstract get(id: string, scope: OwnerScope): Promise<TState | null>;
	abstract set(id: string, state: TState, scope: OwnerScope): Promise<void>;
	abstract delete(id: string, scope: OwnerScope): Promise<void>;

	async findByTag(tag: string, scope: OwnerScope): Promise<TState[]> {
		const all = await this.list(scope, true);
		return all.filter((item) => (item as any).tags?.includes(tag));
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<TState & { scope: OwnerScope }>> {
		const all = await this.backend.query(`SELECT * FROM ${this.config.tableName}`, []);
		const results: Array<TState & { scope: OwnerScope }> = [];

		for (const row of all) {
			const rowScopeLevel = this.config.scope.readScopeLevel(row);
			const rowScopeId = this.config.scope.readScopeId(row);

			const matchesUser =
				scope.level === "user" &&
				rowScopeLevel === "user" &&
				rowScopeId === scope.userId;
			const matchesGlobal = rowScopeLevel === "global";

			if (matchesUser || (includeGlobal && matchesGlobal)) {
				results.push({
					...(this.backend.coerceRow(row) as TState),
					scope: rowScopeLevel === "global" ? { level: "global" } : scope,
				});
			}
		}

		return results;
	}
}