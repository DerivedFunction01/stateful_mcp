import * as crypto from "crypto";
import { Pool } from "pg";
import { registerAdapter } from "../../config/loader";
import type { OwnerScope } from "../../config/types";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../../middleware/dictionary/interfaces";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
	RelatedConceptResult,
	TraversalDirection,
} from "../../middleware/dictionary/types";
import type { EventCommit } from "../../middleware/event/types";
import type {
	FilterCondition,
	FilterState,
} from "../../middleware/filter/types";
import type { FormState } from "../../middleware/form/types";
import type { ObjectState } from "../../middleware/object/types";
import type {
	PersistedEventState,
	PersistedFilterState,
	PersistedFormStateDetails,
	PersistedObjectState,
	PersistentEventStore,
	PersistentFilterStore,
	PersistentFormStore,
	PersistentObjectStore,
	SessionEventStore,
	SessionFilterStore,
	SessionFormStore,
	SessionObjectStore,
} from "./interfaces";

export class PgFilterStore
	implements SessionFilterStore, PersistentFilterStore
{
	private pool: Pool;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(`
        CREATE TABLE IF NOT EXISTS filters (
          filter_id         VARCHAR(100) PRIMARY KEY,
          tool_name         VARCHAR(150) NULL,
          table_name        VARCHAR(150) NULL,
          parent_filter_id  VARCHAR(100) NULL,
          scope_level       VARCHAR(30) NOT NULL DEFAULT 'session',
          session_id        VARCHAR(150) NULL,
          user_id           VARCHAR(100) NULL,
          combined_operation VARCHAR(50) NULL,
          combined_ids      JSONB NULL,
          schema_snapshot   JSONB NULL,
          created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS filter_rules (
          id           SERIAL PRIMARY KEY,
          filter_id    VARCHAR(100) NOT NULL REFERENCES filters(filter_id) ON DELETE CASCADE,
          property     VARCHAR(150) NOT NULL,
          operator     VARCHAR(50)  NOT NULL,
          value        JSONB        NOT NULL,
          index_order  INTEGER      NOT NULL,
          UNIQUE(filter_id, index_order)
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS saved_filters (
          id           VARCHAR(100) PRIMARY KEY,
          tags         JSONB        NOT NULL,
          description  TEXT         NOT NULL,
          scope_level  VARCHAR(30)  NOT NULL,
          user_id      VARCHAR(100) NULL,
          saved_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS session_aliases (
          session_id  VARCHAR(150) NOT NULL,
          alias_name  VARCHAR(150) NOT NULL,
          target_id   VARCHAR(100) NOT NULL,
          PRIMARY KEY (session_id, alias_name)
        );
      `);

			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_filters_session ON filters(session_id, scope_level);",
			);
			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_filters_scope ON filters(scope_level, user_id);",
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			console.error("PgFilterStore failed to initialize schema:", err);
		} finally {
			client.release();
		}
	}

	// ─── Overloaded get ────────────────────────────────────────────────────────

	get(sessionId: string, id: string): Promise<FilterState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		} else {
			return this.getPersistent(a, b);
		}
	}

	// ─── Overloaded set ────────────────────────────────────────────────────────

	set(sessionId: string, id: string, state: FilterState): Promise<void>;
	set(
		id: string,
		state: PersistedFilterState,
		scope: OwnerScope,
	): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.setPersistent(a, b, c);
		} else {
			return this.setSession(a, b, c);
		}
	}

	// ─── Overloaded delete ─────────────────────────────────────────────────────

	delete(sessionId: string, id: string): Promise<void>;
	delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		if (typeof b === "string") {
			return this.deleteSession(a, b);
		} else {
			return this.deletePersistent(a, b);
		}
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const res = await this.pool.query(
			"SELECT target_id FROM session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
		return res.rows[0] ? res.rows[0].target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.pool.query(
			`INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES ($1, $2, $3)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=EXCLUDED.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.pool.query(
			"DELETE FROM session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const res = await this.pool.query(
			"SELECT alias_name, target_id FROM session_aliases WHERE session_id = $1",
			[sessionId],
		);
		return res.rows.map((r: any) => ({
			alias: r.alias_name,
			targetId: r.target_id,
		}));
	}

	async create(
		sessionId: string,
		state: Omit<FilterState, "filterId"> & { filterId?: string },
		alias?: string,
	): Promise<string> {
		const id = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: FilterState = { ...state, filterId: id };
		await this.setSession(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	// ─── Internal Session Operations ───────────────────────────────────────────

	private async getSession(
		sessionId: string,
		id: string,
	): Promise<FilterState | null> {
		const res = await this.pool.query(
			"SELECT * FROM filters WHERE session_id = $1 AND filter_id = $2 AND scope_level = 'session'",
			[sessionId, id],
		);
		const row = res.rows[0];
		if (!row) return null;

		const rulesRes = await this.pool.query(
			"SELECT property, operator, value FROM filter_rules WHERE filter_id = $1 ORDER BY index_order ASC",
			[id],
		);

		const rules: FilterCondition[] = rulesRes.rows.map((r: any) => ({
			property: r.property,
			operator: r.operator as any,
			value: r.value,
		}));

		return {
			filterId: row.filter_id,
			toolName: row.tool_name || undefined,
			tableName: row.table_name || undefined,
			rules,
			parentFilterId: row.parent_filter_id,
			createdAt: row.created_at.toISOString(),
			combined_operation: row.combined_operation,
			combined_ids: row.combined_ids,
			schema_snapshot: row.schema_snapshot,
		};
	}

	private async setSession(
		sessionId: string,
		id: string,
		state: FilterState,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(
				`INSERT INTO filters (filter_id, tool_name, table_name, parent_filter_id, scope_level, session_id, combined_operation, combined_ids, schema_snapshot)
         VALUES ($1, $2, $3, $4, 'session', $5, $6, $7, $8)
         ON CONFLICT(filter_id) DO UPDATE SET
           tool_name=EXCLUDED.tool_name,
           table_name=EXCLUDED.table_name,
           parent_filter_id=EXCLUDED.parent_filter_id,
           combined_operation=EXCLUDED.combined_operation,
           combined_ids=EXCLUDED.combined_ids,
           schema_snapshot=EXCLUDED.schema_snapshot`,
				[
					id,
					state.toolName || null,
					state.tableName || null,
					state.parentFilterId || null,
					sessionId,
					state.combined_operation || null,
					state.combined_ids ? JSON.stringify(state.combined_ids) : null,
					state.schema_snapshot ? JSON.stringify(state.schema_snapshot) : null,
				],
			);

			await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [id]);
			for (let i = 0; i < state.rules.length; i++) {
				const rule = state.rules[i]!;
				await client.query(
					"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES ($1, $2, $3, $4, $5)",
					[id, rule.property, rule.operator, JSON.stringify(rule.value), i],
				);
			}

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [id]);
			await client.query(
				"DELETE FROM filters WHERE session_id = $1 AND filter_id = $2 AND scope_level = 'session'",
				[sessionId, id],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	// ─── Internal Persistent Operations ────────────────────────────────────────

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const savedRes = await this.pool.query(
			"SELECT * FROM saved_filters WHERE id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const saved = savedRes.rows[0];
		if (!saved) return null;

		const filterRes = await this.pool.query(
			"SELECT * FROM filters WHERE filter_id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const row = filterRes.rows[0];
		if (!row) return null;

		const rulesRes = await this.pool.query(
			"SELECT property, operator, value FROM filter_rules WHERE filter_id = $1 ORDER BY index_order ASC",
			[id],
		);

		const rules: FilterCondition[] = rulesRes.rows.map((r: any) => ({
			property: r.property,
			operator: r.operator as any,
			value: r.value,
		}));

		return {
			filterId: row.filter_id,
			toolName: row.tool_name || undefined,
			tableName: row.table_name || undefined,
			rules,
			parentFilterId: row.parent_filter_id,
			createdAt: row.created_at.toISOString(),
			combined_operation: row.combined_operation,
			combined_ids: row.combined_ids,
			tags: saved.tags,
			description: saved.description,
			schema_snapshot: row.schema_snapshot || "{}",
		};
	}

	private async setPersistent(
		id: string,
		state: PersistedFilterState,
		scope: OwnerScope,
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(
				`INSERT INTO filters (filter_id, tool_name, table_name, parent_filter_id, scope_level, user_id, combined_operation, combined_ids, schema_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(filter_id) DO UPDATE SET
           tool_name=EXCLUDED.tool_name,
           table_name=EXCLUDED.table_name,
           parent_filter_id=EXCLUDED.parent_filter_id,
           combined_operation=EXCLUDED.combined_operation,
           combined_ids=EXCLUDED.combined_ids,
           schema_snapshot=EXCLUDED.schema_snapshot`,
				[
					id,
					state.toolName || null,
					state.tableName || null,
					state.parentFilterId || null,
					scope.level,
					scopeId,
					state.combined_operation || null,
					state.combined_ids ? JSON.stringify(state.combined_ids) : null,
					state.schema_snapshot,
				],
			);

			await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [id]);
			for (let i = 0; i < state.rules.length; i++) {
				const rule = state.rules[i]!;
				await client.query(
					"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES ($1, $2, $3, $4, $5)",
					[id, rule.property, rule.operator, JSON.stringify(rule.value), i],
				);
			}

			await client.query(
				`INSERT INTO saved_filters (id, tags, description, scope_level, user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
           tags=EXCLUDED.tags,
           description=EXCLUDED.description,
           scope_level=EXCLUDED.scope_level,
           user_id=EXCLUDED.user_id`,
				[
					id,
					JSON.stringify(state.tags),
					state.description,
					scope.level,
					scopeId,
				],
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [id]);
			await client.query("DELETE FROM saved_filters WHERE id = $1", [id]);
			await client.query(
				"DELETE FROM filters WHERE filter_id = $1 AND scope_level = $2",
				[id, scope.level],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	// ─── Additional Interface Methods ──────────────────────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT filter_id FROM filters WHERE session_id = $1 AND scope_level = 'session'",
			[sessionId],
		);
		return res.rows.map((r: any) => r.filter_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT filter_id FROM filters WHERE session_id = $1 AND parent_filter_id = $2 AND scope_level = 'session'",
			[sessionId, parentId],
		);
		return res.rows.map((r: any) => r.filter_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			if (olderThanMs !== undefined) {
				const cutoff = new Date(Date.now() - olderThanMs);
				const rows = await client.query(
					"SELECT filter_id FROM filters WHERE session_id = $1 AND scope_level = 'session' AND created_at < $2",
					[sessionId, cutoff],
				);
				for (const r of rows.rows) {
					await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [
						r.filter_id,
					]);
					await client.query("DELETE FROM filters WHERE filter_id = $1", [
						r.filter_id,
					]);
				}
			} else {
				await client.query(
					"DELETE FROM filter_rules WHERE filter_id IN (SELECT filter_id FROM filters WHERE session_id = $1)",
					[sessionId],
				);
				await client.query(
					"DELETE FROM filters WHERE session_id = $1 AND scope_level = 'session'",
					[sessionId],
				);
			}
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const res = await this.pool.query(
			"SELECT id, tags FROM saved_filters WHERE scope_level = $1 AND (user_id = $2 OR user_id IS NULL)",
			[scope.level, scopeId],
		);

		const results: PersistedFilterState[] = [];
		for (const row of res.rows) {
			const tags: string[] = row.tags;
			if (tags.includes(tag)) {
				const full = await this.get(row.id, scope);
				if (full) results.push(full);
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
		const userScopeId = scope.level === "user" ? scope.userId : null;

		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_filters WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = $1 AND user_id = $2)";
				params.push(scope.level, userScopeId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_filters WHERE scope_level = $1 AND user_id = $2";
				params.push(scope.level, userScopeId);
			}
		}

		const res = await this.pool.query(queryStr, params);

		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
		for (const r of res.rows) {
			const recordScope: OwnerScope =
				r.scope_level === "user"
					? { level: "user", userId: r.user_id }
					: { level: "global" };

			const state = await this.get(r.id, recordScope);
			if (state) {
				results.push({
					...state,
					scope: recordScope,
				});
			}
		}
		return results;
	}
}

// ── PG Object Store ──────────────────────────────────────────

export class PgObjectStore
	implements SessionObjectStore, PersistentObjectStore
{
	private pool: Pool;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(`
        CREATE TABLE IF NOT EXISTS objects (
          object_id         VARCHAR(100) PRIMARY KEY,
          schema_name       VARCHAR(150) NOT NULL,
          parent_object_id  VARCHAR(100) NULL,
          scope_level       VARCHAR(30) NOT NULL DEFAULT 'session',
          session_id        VARCHAR(150) NULL,
          user_id           VARCHAR(100) NULL,
          data              JSONB NOT NULL,
          created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          schema_pinned_at  TIMESTAMP WITH TIME ZONE NULL
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS saved_objects (
          id           VARCHAR(100) PRIMARY KEY,
          tags         JSONB        NOT NULL,
          description  TEXT         NOT NULL,
          scope_level  VARCHAR(30)  NOT NULL,
          user_id      VARCHAR(100) NULL,
          saved_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS object_session_aliases (
          session_id  VARCHAR(150) NOT NULL,
          alias_name  VARCHAR(150) NOT NULL,
          target_id   VARCHAR(100) NOT NULL,
          PRIMARY KEY (session_id, alias_name)
        );
      `);

			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_objects_session ON objects(session_id, scope_level);",
			);
			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_objects_scope ON objects(scope_level, user_id);",
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			console.error("PgObjectStore failed to initialize schema:", err);
		} finally {
			client.release();
		}
	}

	// ─── Overloaded get ────────────────────────────────────────

	get(sessionId: string, id: string): Promise<ObjectState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		} else {
			return this.getPersistent(a, b);
		}
	}

	// ─── Overloaded set ────────────────────────────────────────

	set(sessionId: string, id: string, state: ObjectState): Promise<void>;
	set(
		id: string,
		state: PersistedObjectState,
		scope: OwnerScope,
	): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.setPersistent(a, b, c);
		} else {
			return this.setSession(a, b, c);
		}
	}

	// ─── Overloaded delete ─────────────────────────────────────

	delete(sessionId: string, id: string): Promise<void>;
	delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		if (typeof b === "string") {
			return this.deleteSession(a, b);
		} else {
			return this.deletePersistent(a, b);
		}
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const res = await this.pool.query(
			"SELECT target_id FROM object_session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
		return res.rows[0] ? res.rows[0].target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.pool.query(
			`INSERT INTO object_session_aliases (session_id, alias_name, target_id)
        VALUES ($1, $2, $3)
        ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=EXCLUDED.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.pool.query(
			"DELETE FROM object_session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const res = await this.pool.query(
			"SELECT alias_name, target_id FROM object_session_aliases WHERE session_id = $1",
			[sessionId],
		);
		return res.rows.map((r: any) => ({
			alias: r.alias_name,
			targetId: r.target_id,
		}));
	}

	async create(
		sessionId: string,
		state: Omit<ObjectState, "objectId"> & { objectId?: string },
		alias?: string,
	): Promise<string> {
		const id =
			state.objectId ||
			`obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: ObjectState = { ...state, objectId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	// ─── Internal Session Operations ───────────────────────────

	private async getSession(
		sessionId: string,
		id: string,
	): Promise<ObjectState | null> {
		const res = await this.pool.query(
			"SELECT * FROM objects WHERE session_id = $1 AND object_id = $2 AND scope_level = 'session'",
			[sessionId, id],
		);
		const row = res.rows[0];
		if (!row) return null;
		return this.loadState(row);
	}

	private async setSession(
		sessionId: string,
		id: string,
		state: ObjectState,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query(
				`INSERT INTO objects (object_id, schema_name, parent_object_id, scope_level, session_id, data, created_at, schema_pinned_at)
        VALUES ($1, $2, $3, 'session', $4, $5, $6, $7)
        ON CONFLICT(object_id) DO UPDATE SET
          schema_name=EXCLUDED.schema_name,
          parent_object_id=EXCLUDED.parent_object_id,
          scope_level=EXCLUDED.scope_level,
          session_id=EXCLUDED.session_id,
          data=EXCLUDED.data,
          created_at=EXCLUDED.created_at,
          schema_pinned_at=EXCLUDED.schema_pinned_at`,
				[
					id,
					state.schemaName,
					state.parentObjectId || null,
					sessionId,
					JSON.stringify(state.data),
					state.createdAt,
					state.schema_pinned_at || null,
				],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query(
				"DELETE FROM objects WHERE session_id = $1 AND object_id = $2 AND scope_level = 'session'",
				[sessionId, id],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private loadState(row: any): ObjectState {
		return {
			objectId: row.object_id,
			schemaName: row.schema_name,
			parentObjectId: row.parent_object_id,
			data: row.data,
			createdAt: row.created_at,
			schema_pinned_at: row.schema_pinned_at || undefined,
		};
	}

	// ─── Internal Persistent Operations ────────────────────────

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const savedRes = await this.pool.query(
			"SELECT * FROM saved_objects WHERE id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const saved = savedRes.rows[0];
		if (!saved) return null;

		const row = await this.pool.query(
			"SELECT * FROM objects WHERE object_id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const objRow = row.rows[0];
		if (!objRow) return null;

		return {
			...this.loadState(objRow),
			tags: saved.tags,
			description: saved.description,
			schema_pinned_at: objRow.schema_pinned_at || "",
		};
	}

	private async setPersistent(
		id: string,
		state: PersistedObjectState,
		scope: OwnerScope,
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(
				`INSERT INTO objects (object_id, schema_name, parent_object_id, scope_level, user_id, data, created_at, schema_pinned_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(object_id) DO UPDATE SET
          schema_name=EXCLUDED.schema_name,
          parent_object_id=EXCLUDED.parent_object_id,
          scope_level=EXCLUDED.scope_level,
          user_id=EXCLUDED.user_id,
          data=EXCLUDED.data,
          created_at=EXCLUDED.created_at,
          schema_pinned_at=EXCLUDED.schema_pinned_at`,
				[
					id,
					state.schemaName,
					state.parentObjectId || null,
					scope.level,
					scopeId,
					JSON.stringify(state.data),
					state.createdAt,
					state.schema_pinned_at || null,
				],
			);

			await client.query(
				`INSERT INTO saved_objects (id, tags, description, scope_level, user_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(id) DO UPDATE SET
          tags=EXCLUDED.tags,
          description=EXCLUDED.description,
          scope_level=EXCLUDED.scope_level,
          user_id=EXCLUDED.user_id`,
				[
					id,
					JSON.stringify(state.tags),
					state.description,
					scope.level,
					scopeId,
				],
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query("DELETE FROM saved_objects WHERE id = $1", [id]);
			await client.query(
				"DELETE FROM objects WHERE object_id = $1 AND scope_level = $2",
				[id, scope.level],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	// ─── Additional Interface Methods ──────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT object_id FROM objects WHERE session_id = $1 AND scope_level = 'session'",
			[sessionId],
		);
		return res.rows.map((r: any) => r.object_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT object_id FROM objects WHERE session_id = $1 AND parent_object_id = $2 AND scope_level = 'session'",
			[sessionId, parentId],
		);
		return res.rows.map((r: any) => r.object_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			if (olderThanMs !== undefined) {
				const cutoff = new Date(Date.now() - olderThanMs);
				await client.query(
					"DELETE FROM objects WHERE session_id = $1 AND scope_level = 'session' AND created_at < $2",
					[sessionId, cutoff],
				);
			} else {
				await client.query(
					"DELETE FROM objects WHERE session_id = $1 AND scope_level = 'session'",
					[sessionId],
				);
			}
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const res = await this.pool.query(
			"SELECT id, tags FROM saved_objects WHERE scope_level = $1 AND (user_id = $2 OR user_id IS NULL)",
			[scope.level, scopeId],
		);

		const results: PersistedObjectState[] = [];
		for (const row of res.rows) {
			const tags: string[] = row.tags;
			if (tags.includes(tag)) {
				const full = await this.getPersistent(row.id, scope);
				if (full) results.push(full);
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
		const userScopeId = scope.level === "user" ? scope.userId : null;

		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_objects WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = $1 AND user_id = $2)";
				params.push(scope.level, userScopeId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_objects WHERE scope_level = $1 AND user_id = $2";
				params.push(scope.level, userScopeId);
			}
		}

		const res = await this.pool.query(queryStr, params);

		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
		for (const r of res.rows) {
			const recordScope: OwnerScope =
				r.scope_level === "user"
					? { level: "user", userId: r.user_id }
					: { level: "global" };

			const state = await this.getPersistent(r.id, recordScope);
			if (state) {
				results.push({
					...state,
					scope: recordScope,
				});
			}
		}
		return results;
	}
}

// ── PG Event Store ────────────────────────────────────────────

export class PgEventStore implements SessionEventStore, PersistentEventStore {
	private pool: Pool;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          commit_id         VARCHAR(100) PRIMARY KEY,
          session_id        VARCHAR(150) NULL,
          parent_commit_id  VARCHAR(100) NULL,
          scope_level       VARCHAR(30) NOT NULL DEFAULT 'session',
          user_id           VARCHAR(100) NULL,
          operation         VARCHAR(20) NOT NULL,
          mutations         JSONB NOT NULL,
          created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          linear_depth      INTEGER NOT NULL DEFAULT 0,
          gc_lock           BOOLEAN NOT NULL DEFAULT FALSE,
          merge_source_commit_ids JSONB NULL,
          merge_accepted_ids JSONB NULL,
          merge_rejected_ids JSONB NULL,
          schema_name       VARCHAR(150) NOT NULL
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS saved_events (
          id           VARCHAR(100) PRIMARY KEY,
          tags         JSONB        NOT NULL,
          description  TEXT         NOT NULL,
          scope_level  VARCHAR(30)  NOT NULL,
          user_id      VARCHAR(100) NULL,
          saved_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS event_session_aliases (
          session_id  VARCHAR(150) NOT NULL,
          alias_name  VARCHAR(150) NOT NULL,
          target_id   VARCHAR(100) NOT NULL,
          PRIMARY KEY (session_id, alias_name)
        );
      `);

			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_events_session ON events(session_id, scope_level);",
			);
			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_events_scope ON events(scope_level, user_id);",
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			console.error("PgEventStore failed to initialize schema:", err);
		} finally {
			client.release();
		}
	}

	// ─── Overloaded get ────────────────────────────────────────

	get(sessionId: string, commitId: string): Promise<EventCommit | null>;
	get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		} else {
			return this.getPersistent(a, b);
		}
	}

	// ─── Overloaded set ────────────────────────────────────────

	set(sessionId: string, commitId: string, state: EventCommit): Promise<void>;
	set(
		commitId: string,
		state: PersistedEventState,
		scope: OwnerScope,
	): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.setPersistent(a, b, c);
		} else {
			return this.setSession(a, b, c);
		}
	}

	// ─── Overloaded delete ─────────────────────────────────────

	delete(sessionId: string, commitId: string): Promise<void>;
	delete(commitId: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		if (typeof b === "string") {
			return this.deleteSession(a, b);
		} else {
			return this.deletePersistent(a, b);
		}
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const res = await this.pool.query(
			"SELECT target_id FROM event_session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
		return res.rows[0] ? res.rows[0].target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.pool.query(
			`INSERT INTO event_session_aliases (session_id, alias_name, target_id)
        VALUES ($1, $2, $3)
        ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=EXCLUDED.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.pool.query(
			"DELETE FROM event_session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const res = await this.pool.query(
			"SELECT alias_name, target_id FROM event_session_aliases WHERE session_id = $1",
			[sessionId],
		);
		return res.rows.map((r: any) => ({
			alias: r.alias_name,
			targetId: r.target_id,
		}));
	}

	async create(
		sessionId: string,
		state: Omit<EventCommit, "commitId"> & { commitId?: string },
		alias?: string,
	): Promise<string> {
		const commitId =
			state.commitId ||
			`commit_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: EventCommit = { ...state, commitId };
		await this.set(sessionId, commitId, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, commitId);
		}
		return commitId;
	}

	// ─── Internal Session Operations ───────────────────────────

	private async getSession(
		sessionId: string,
		commitId: string,
	): Promise<EventCommit | null> {
		const res = await this.pool.query(
			"SELECT * FROM events WHERE session_id = $1 AND commit_id = $2 AND scope_level = 'session'",
			[sessionId, commitId],
		);
		const row = res.rows[0];
		if (!row) return null;
		return this.loadState(row);
	}

	private async setSession(
		sessionId: string,
		commitId: string,
		state: EventCommit,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query(
				`INSERT INTO events (commit_id, session_id, parent_commit_id, scope_level, operation, mutations, created_at, linear_depth, gc_lock, merge_source_commit_ids, merge_accepted_ids, merge_rejected_ids)
        VALUES ($1, $2, $3, 'session', $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT(commit_id) DO UPDATE SET
          session_id=EXCLUDED.session_id,
          parent_commit_id=EXCLUDED.parent_commit_id,
          scope_level=EXCLUDED.scope_level,
          operation=EXCLUDED.operation,
          mutations=EXCLUDED.mutations,
          created_at=EXCLUDED.created_at,
          linear_depth=EXCLUDED.linear_depth,
          gc_lock=EXCLUDED.gc_lock,
          merge_source_commit_ids=EXCLUDED.merge_source_commit_ids,
          merge_accepted_ids=EXCLUDED.merge_accepted_ids,
          merge_rejected_ids=EXCLUDED.merge_rejected_ids`,
				[
					commitId,
					sessionId,
					state.parentCommitId || null,
					state.operation,
					JSON.stringify(state.mutations),
					state.createdAt,
					state.linearDepth || 0,
					state.gcLock,
					state.mergeSourceCommitIds
						? JSON.stringify(state.mergeSourceCommitIds)
						: null,
					state.mergeAcceptedIds
						? JSON.stringify(state.mergeAcceptedIds)
						: null,
					state.mergeRejectedIds
						? JSON.stringify(state.mergeRejectedIds)
						: null,
				],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async deleteSession(
		sessionId: string,
		commitId: string,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query(
				"DELETE FROM events WHERE session_id = $1 AND commit_id = $2 AND scope_level = 'session'",
				[sessionId, commitId],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private loadState(row: any): EventCommit {
		return {
			commitId: row.commit_id,
			sessionId: row.session_id,
			parentCommitId: row.parent_commit_id,
			createdAt: row.created_at,
			operation: row.operation,
			mutations: row.mutations,
			linearDepth: row.linear_depth || 0,
			gcLock: row.gc_lock,
			mergeSourceCommitIds: row.merge_source_commit_ids,
			mergeAcceptedIds: row.merge_accepted_ids,
			mergeRejectedIds: row.merge_rejected_ids,
		};
	}

	// ─── Internal Persistent Operations ────────────────────────

	private async getPersistent(
		commitId: string,
		scope: OwnerScope,
	): Promise<PersistedEventState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const savedRes = await this.pool.query(
			"SELECT * FROM saved_events WHERE id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
			[commitId, scope.level, scopeId],
		);
		const saved = savedRes.rows[0];
		if (!saved) return null;

		const row = await this.pool.query(
			"SELECT * FROM events WHERE commit_id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
			[commitId, scope.level, scopeId],
		);
		const eventRow = row.rows[0];
		if (!eventRow) return null;

		return {
			...this.loadState(eventRow),
			tags: saved.tags,
			description: saved.description,
			schema_name: eventRow.schema_name,
		};
	}

	private async setPersistent(
		commitId: string,
		state: PersistedEventState,
		scope: OwnerScope,
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(
				`INSERT INTO events (commit_id, scope_level, user_id, parent_commit_id, operation, mutations, created_at, linear_depth, gc_lock, merge_source_commit_ids, merge_accepted_ids, merge_rejected_ids, schema_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT(commit_id) DO UPDATE SET
          scope_level=EXCLUDED.scope_level,
          user_id=EXCLUDED.user_id,
          parent_commit_id=EXCLUDED.parent_commit_id,
          operation=EXCLUDED.operation,
          mutations=EXCLUDED.mutations,
          created_at=EXCLUDED.created_at,
          linear_depth=EXCLUDED.linear_depth,
          gc_lock=EXCLUDED.gc_lock,
          merge_source_commit_ids=EXCLUDED.merge_source_commit_ids,
          merge_accepted_ids=EXCLUDED.merge_accepted_ids,
          merge_rejected_ids=EXCLUDED.merge_rejected_ids,
          schema_name=EXCLUDED.schema_name`,
				[
					commitId,
					scope.level,
					scopeId,
					state.parentCommitId || null,
					state.operation,
					JSON.stringify(state.mutations),
					state.createdAt,
					state.linearDepth || 0,
					state.gcLock,
					state.mergeSourceCommitIds
						? JSON.stringify(state.mergeSourceCommitIds)
						: null,
					state.mergeAcceptedIds
						? JSON.stringify(state.mergeAcceptedIds)
						: null,
					state.mergeRejectedIds
						? JSON.stringify(state.mergeRejectedIds)
						: null,
					state.schema_name,
				],
			);

			await client.query(
				`INSERT INTO saved_events (id, tags, description, scope_level, user_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(id) DO UPDATE SET
          tags=EXCLUDED.tags,
          description=EXCLUDED.description,
          scope_level=EXCLUDED.scope_level,
          user_id=EXCLUDED.user_id`,
				[
					commitId,
					JSON.stringify(state.tags),
					state.description,
					scope.level,
					scopeId,
				],
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async deletePersistent(
		commitId: string,
		scope: OwnerScope,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			await client.query("DELETE FROM saved_events WHERE id = $1", [commitId]);
			await client.query(
				"DELETE FROM events WHERE commit_id = $1 AND scope_level = $2",
				[commitId, scope.level],
			);
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	// ─── Additional Interface Methods ──────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT commit_id FROM events WHERE session_id = $1 AND scope_level = 'session'",
			[sessionId],
		);
		return res.rows.map((r: any) => r.commit_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT commit_id FROM events WHERE session_id = $1 AND parent_commit_id = $2 AND scope_level = 'session'",
			[sessionId, parentId],
		);
		return res.rows.map((r: any) => r.commit_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			if (olderThanMs !== undefined) {
				const cutoff = new Date(Date.now() - olderThanMs);
				await client.query(
					"DELETE FROM events WHERE session_id = $1 AND scope_level = 'session' AND created_at < $2",
					[sessionId, cutoff],
				);
			} else {
				await client.query(
					"DELETE FROM events WHERE session_id = $1 AND scope_level = 'session'",
					[sessionId],
				);
			}
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedEventState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const res = await this.pool.query(
			"SELECT id, tags FROM saved_events WHERE scope_level = $1 AND (user_id = $2 OR user_id IS NULL)",
			[scope.level, scopeId],
		);

		const results: PersistedEventState[] = [];
		for (const row of res.rows) {
			const tags: string[] = row.tags;
			if (tags.includes(tag)) {
				const full = await this.getPersistent(row.id, scope);
				if (full) results.push(full);
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
		const userScopeId = scope.level === "user" ? scope.userId : null;

		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_events WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = $1 AND user_id = $2)";
				params.push(scope.level, userScopeId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_events WHERE scope_level = $1 AND user_id = $2";
				params.push(scope.level, userScopeId);
			}
		}

		const res = await this.pool.query(queryStr, params);

		const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
		for (const r of res.rows) {
			const recordScope: OwnerScope =
				r.scope_level === "user"
					? { level: "user", userId: r.user_id }
					: { level: "global" };

			const state = await this.getPersistent(r.id, recordScope);
			if (state) {
				results.push({
					...state,
					scope: recordScope,
				});
			}
		}
		return results;
	}
}

// ── PG Form Store ─────────────────────────────────────────────

export class PgFormStore implements SessionFormStore, PersistentFormStore {
	private pool: Pool;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(`
        CREATE TABLE IF NOT EXISTS forms (
          form_id          VARCHAR(100) PRIMARY KEY,
          parent_form_id   VARCHAR(100) NULL,
          schema_name      VARCHAR(150) NOT NULL,
          scope_level      VARCHAR(30) NOT NULL DEFAULT 'session',
          session_id       VARCHAR(150) NULL,
          user_id          VARCHAR(100) NULL,
          created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS form_answers (
          form_id      VARCHAR(100) NOT NULL,
          question_id  VARCHAR(150) NOT NULL,
          value        JSONB NOT NULL,
          PRIMARY KEY(form_id, question_id),
          FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS form_skipped (
          form_id      VARCHAR(100) NOT NULL,
          question_id  VARCHAR(150) NOT NULL,
          PRIMARY KEY(form_id, question_id),
          FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS form_stale (
          form_id      VARCHAR(100) NOT NULL,
          question_id  VARCHAR(150) NOT NULL,
          PRIMARY KEY(form_id, question_id),
          FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS saved_forms (
          id           VARCHAR(100) PRIMARY KEY,
          tags         JSONB        NOT NULL,
          description  TEXT         NOT NULL,
          scope_level  VARCHAR(30)  NOT NULL,
          user_id      VARCHAR(100) NULL,
          saved_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS form_session_aliases (
          session_id  VARCHAR(150) NOT NULL,
          alias_name  VARCHAR(150) NOT NULL,
          target_id   VARCHAR(100) NOT NULL,
          PRIMARY KEY (session_id, alias_name)
        );
      `);

			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_forms_session ON forms(session_id, scope_level);",
			);
			await client.query(
				"CREATE INDEX IF NOT EXISTS idx_pg_forms_scope ON forms(scope_level, user_id);",
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			console.error("PgFormStore failed to initialize schema:", err);
		} finally {
			client.release();
		}
	}

	get(sessionId: string, id: string): Promise<FormState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedFormStateDetails | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		} else {
			return this.getPersistent(a, b);
		}
	}

	private async getSession(
		sessionId: string,
		id: string,
	): Promise<FormState | null> {
		const res = await this.pool.query(
			"SELECT * FROM forms WHERE form_id = $1 AND session_id = $2",
			[id, sessionId],
		);
		const row = res.rows[0];
		if (!row) return null;
		return this.loadState(row);
	}

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails | null> {
		const row = await this.pool.query(
			"SELECT * FROM forms WHERE form_id = $1 AND scope_level = $2",
			[id, scope.level],
		);
		const formRow = row.rows[0];
		if (!formRow) return null;

		const savedRes = await this.pool.query(
			"SELECT * FROM saved_forms WHERE id = $1",
			[id],
		);
		const saved = savedRes.rows[0];
		const tags = saved ? saved.tags : [];
		const description = saved ? saved.description : "";

		const state = await this.loadState(formRow);
		return {
			...state,
			tags,
			description,
			schema_pinned_at: formRow.created_at,
		};
	}

	private async loadState(row: any): Promise<FormState> {
		const formId = row.form_id;

		const answersRes = await this.pool.query(
			"SELECT * FROM form_answers WHERE form_id = $1",
			[formId],
		);
		const answers: Record<string, any> = {};
		for (const r of answersRes.rows) {
			answers[r.question_id] = r.value;
		}

		const skippedRes = await this.pool.query(
			"SELECT * FROM form_skipped WHERE form_id = $1",
			[formId],
		);
		const skipped = skippedRes.rows.map((r: any) => r.question_id);

		const staleRes = await this.pool.query(
			"SELECT * FROM form_stale WHERE form_id = $1",
			[formId],
		);
		const stale: Record<string, boolean> = {};
		for (const r of staleRes.rows) {
			stale[r.question_id] = true;
		}

		return {
			formId,
			parentFormId: row.parent_form_id,
			schemaName: row.schema_name,
			answers,
			skipped,
			stale,
			timestamp: row.created_at,
		};
	}

	set(sessionId: string, id: string, state: FormState): Promise<void>;
	set(
		id: string,
		state: PersistedFormStateDetails,
		scope: OwnerScope,
	): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			await this.setPersistent(a, b, c);
		} else {
			await this.setSession(a, b, c);
		}
	}

	private async setSession(
		sessionId: string,
		id: string,
		state: FormState,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(
				`INSERT INTO forms (form_id, parent_form_id, schema_name, scope_level, session_id, created_at)
        VALUES ($1, $2, $3, 'session', $4, $5)
        ON CONFLICT(form_id) DO UPDATE SET
          parent_form_id=EXCLUDED.parent_form_id,
          schema_name=EXCLUDED.schema_name,
          scope_level=EXCLUDED.scope_level,
          session_id=EXCLUDED.session_id,
          created_at=EXCLUDED.created_at`,
				[id, state.parentFormId, state.schemaName, sessionId, state.timestamp],
			);

			await client.query("DELETE FROM form_answers WHERE form_id = $1", [id]);
			for (const [qId, val] of Object.entries(state.answers)) {
				await client.query(
					"INSERT INTO form_answers (form_id, question_id, value) VALUES ($1, $2, $3)",
					[id, qId, JSON.stringify(val)],
				);
			}

			await client.query("DELETE FROM form_skipped WHERE form_id = $1", [id]);
			for (const qId of state.skipped) {
				await client.query(
					"INSERT INTO form_skipped (form_id, question_id) VALUES ($1, $2)",
					[id, qId],
				);
			}

			await client.query("DELETE FROM form_stale WHERE form_id = $1", [id]);
			for (const qId of Object.keys(state.stale)) {
				await client.query(
					"INSERT INTO form_stale (form_id, question_id) VALUES ($1, $2)",
					[id, qId],
				);
			}

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	private async setPersistent(
		id: string,
		state: PersistedFormStateDetails,
		scope: OwnerScope,
	): Promise<void> {
		const userId = scope.level === "user" ? scope.userId : null;
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(
				`INSERT INTO forms (form_id, parent_form_id, schema_name, scope_level, user_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(form_id) DO UPDATE SET
          parent_form_id=EXCLUDED.parent_form_id,
          schema_name=EXCLUDED.schema_name,
          scope_level=EXCLUDED.scope_level,
          user_id=EXCLUDED.user_id,
          created_at=EXCLUDED.created_at`,
				[
					id,
					state.parentFormId,
					state.schemaName,
					scope.level,
					userId,
					state.timestamp,
				],
			);

			await client.query("DELETE FROM form_answers WHERE form_id = $1", [id]);
			for (const [qId, val] of Object.entries(state.answers)) {
				await client.query(
					"INSERT INTO form_answers (form_id, question_id, value) VALUES ($1, $2, $3)",
					[id, qId, JSON.stringify(val)],
				);
			}

			await client.query("DELETE FROM form_skipped WHERE form_id = $1", [id]);
			for (const qId of state.skipped) {
				await client.query(
					"INSERT INTO form_skipped (form_id, question_id) VALUES ($1, $2)",
					[id, qId],
				);
			}

			await client.query("DELETE FROM form_stale WHERE form_id = $1", [id]);
			for (const qId of Object.keys(state.stale)) {
				await client.query(
					"INSERT INTO form_stale (form_id, question_id) VALUES ($1, $2)",
					[id, qId],
				);
			}

			await client.query(
				`INSERT INTO saved_forms (id, tags, description, scope_level, user_id, saved_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(id) DO UPDATE SET
          tags=EXCLUDED.tags,
          description=EXCLUDED.description,
          scope_level=EXCLUDED.scope_level,
          user_id=EXCLUDED.user_id,
          saved_at=EXCLUDED.saved_at`,
				[
					id,
					JSON.stringify(state.tags),
					state.description,
					scope.level,
					userId,
					state.timestamp,
				],
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	async delete(sessionId: string, id: string): Promise<void>;
	async delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b?: any): Promise<void> {
		await this.pool.query("DELETE FROM form_answers WHERE form_id = $1", [a]);
		await this.pool.query("DELETE FROM form_skipped WHERE form_id = $1", [a]);
		await this.pool.query("DELETE FROM form_stale WHERE form_id = $1", [a]);
		await this.pool.query("DELETE FROM forms WHERE form_id = $1", [a]);
		await this.pool.query("DELETE FROM saved_forms WHERE id = $1", [a]);
	}

	async listSession(sessionId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT form_id FROM forms WHERE session_id = $1 AND scope_level = 'session'",
			[sessionId],
		);
		return res.rows.map((r: any) => r.form_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const res = await this.pool.query(
			"SELECT form_id FROM forms WHERE session_id = $1 AND parent_form_id = $2",
			[sessionId, parentId],
		);
		return res.rows.map((r: any) => r.form_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");
			if (olderThanMs !== undefined) {
				const cutoff = new Date(Date.now() - olderThanMs);
				await client.query(
					"DELETE FROM forms WHERE session_id = $1 AND created_at < $2",
					[sessionId, cutoff],
				);
			} else {
				await client.query("DELETE FROM forms WHERE session_id = $1", [
					sessionId,
				]);
			}
			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			throw err;
		} finally {
			client.release();
		}
	}

	async create(
		sessionId: string,
		state: Omit<FormState, "formId"> & { formId?: string },
		alias?: string,
	): Promise<string> {
		const id =
			state.formId ||
			`form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: FormState = { ...state, formId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const res = await this.pool.query(
			"SELECT target_id FROM form_session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
		return res.rows[0] ? res.rows[0].target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.pool.query(
			`INSERT INTO form_session_aliases (session_id, alias_name, target_id)
        VALUES ($1, $2, $3)
        ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=EXCLUDED.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.pool.query(
			"DELETE FROM form_session_aliases WHERE session_id = $1 AND alias_name = $2",
			[sessionId, alias],
		);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const res = await this.pool.query(
			"SELECT alias_name, target_id FROM form_session_aliases WHERE session_id = $1",
			[sessionId],
		);
		return res.rows.map((r: any) => ({
			alias: r.alias_name,
			targetId: r.target_id,
		}));
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails[]> {
		const userId = scope.level === "user" ? scope.userId : null;
		const query =
			scope.level === "user"
				? "SELECT id FROM saved_forms WHERE scope_level = 'user' AND user_id = $1 AND tags @> $2"
				: "SELECT id FROM saved_forms WHERE scope_level = 'global' AND tags @> $1";

		const params =
			scope.level === "user"
				? [userId, JSON.stringify([tag])]
				: [JSON.stringify([tag])];
		const rows = await this.pool.query(query, params);

		const results: PersistedFormStateDetails[] = [];
		for (const r of rows.rows) {
			const state = await this.getPersistent(r.id, scope);
			if (state) results.push(state);
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_forms WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = 'user' AND user_id = $1)";
				params.push(userId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_forms WHERE scope_level = 'user' AND user_id = $1";
				params.push(userId);
			}
		}

		const savedRecords = await this.pool.query(queryStr, params);
		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> =
			[];
		for (const r of savedRecords.rows) {
			const recordScope: OwnerScope =
				r.scope_level === "user"
					? { level: "user", userId: r.user_id }
					: { level: "global" };
			const state = await this.getPersistent(r.id, recordScope);
			if (state) {
				results.push({ ...state, scope: recordScope });
			}
		}
		return results;
	}
}

// ── PG Concept Store ──────────────────────────────────────────

export class PgConceptStore implements ConceptStore {
	private pool: Pool;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN;");

			await client.query(`
        CREATE TABLE IF NOT EXISTS dict_namespaces (
          code TEXT PRIMARY KEY,
          description TEXT,
          is_public BOOLEAN NOT NULL,
          is_external_private BOOLEAN NOT NULL,
          is_mutable BOOLEAN
        )
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS dict_concepts (
          id TEXT PRIMARY KEY,
          namespace_code TEXT NOT NULL,
          standard_code TEXT NOT NULL,
          display TEXT NOT NULL,
          description TEXT,
          designation_date TIMESTAMP WITH TIME ZONE,
          active BOOLEAN NOT NULL,
          FOREIGN KEY(namespace_code) REFERENCES dict_namespaces(code)
        )
      `);

			await client.query(`
        CREATE TABLE IF NOT EXISTS dict_relations (
          id TEXT PRIMARY KEY,
          concept_id TEXT NOT NULL,
          linked_id TEXT NOT NULL,
          relationship_type TEXT NOT NULL,
          active BOOLEAN NOT NULL,
          designation_date TIMESTAMP WITH TIME ZONE,
          FOREIGN KEY(concept_id) REFERENCES dict_concepts(id),
          FOREIGN KEY(linked_id) REFERENCES dict_concepts(id)
        )
      `);

			await client.query(
				`CREATE INDEX IF NOT EXISTS idx_concept_rel_forward ON dict_relations(concept_id, active)`,
			);
			await client.query(
				`CREATE INDEX IF NOT EXISTS idx_concept_rel_reverse ON dict_relations(linked_id, active)`,
			);

			await client.query(`
        CREATE TABLE IF NOT EXISTS dict_relation_cache (
          ancestor_concept_id TEXT NOT NULL,
          descendant_concept_id TEXT NOT NULL,
          link_depth INTEGER NOT NULL,
          inferred_relationship_type TEXT NOT NULL,
          active BOOLEAN NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
          PRIMARY KEY(ancestor_concept_id, descendant_concept_id, inferred_relationship_type)
        )
      `);

			await client.query(
				`CREATE INDEX IF NOT EXISTS idx_concept_cache_traversal ON dict_relation_cache(ancestor_concept_id, active)`,
			);

			await client.query("COMMIT;");
		} catch (err) {
			await client.query("ROLLBACK;");
			console.error("PgConceptStore failed to initialize schema:", err);
		} finally {
			client.release();
		}
	}

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		let sql =
			"SELECT * FROM dict_concepts WHERE (display ILIKE $1 OR id = $2 OR standard_code = $3 OR description ILIKE $4)";
		const params: any[] = [`%${query}%`, query, query, `%${query}%`];

		if (namespaceCode) {
			sql += " AND namespace_code = $5";
			params.push(namespaceCode);
		}

		sql += " LIMIT $6";
		params.push(limit);

		const res = await this.pool.query(sql, params);
		return res.rows.map((r: any) => ({
			id: r.id,
			namespaceCode: r.namespace_code,
			standardCode: r.standard_code,
			display: r.display,
			description: r.description || undefined,
			designationDate: r.designation_date || undefined,
			active: r.active,
		}));
	}

	async getById(id: string): Promise<Concept | null> {
		const res = await this.pool.query(
			"SELECT * FROM dict_concepts WHERE id = $1",
			[id],
		);
		const row = res.rows[0];
		if (!row) return null;
		return {
			id: row.id,
			namespaceCode: row.namespace_code,
			standardCode: row.standard_code,
			display: row.display,
			description: row.description || undefined,
			designationDate: row.designation_date || undefined,
			active: row.active,
		};
	}

	async listNamespaces(): Promise<Namespace[]> {
		const res = await this.pool.query("SELECT * FROM dict_namespaces");
		return res.rows.map((r: any) => ({
			code: r.code,
			description: r.description || undefined,
			isPublic: r.is_public,
			isExternalPrivate: r.is_external_private,
			isMutable: r.is_mutable,
		}));
	}

	async addConcept(concept: Concept): Promise<void> {
		await this.pool.query(
			`INSERT INTO dict_concepts (id, namespace_code, standard_code, display, description, designation_date, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(id) DO UPDATE SET
        namespace_code=EXCLUDED.namespace_code,
        standard_code=EXCLUDED.standard_code,
        display=EXCLUDED.display,
        description=EXCLUDED.description,
        designation_date=EXCLUDED.designation_date,
        active=EXCLUDED.active`,
			[
				concept.id,
				concept.namespaceCode,
				concept.standardCode,
				concept.display,
				concept.description || null,
				concept.designationDate || null,
				concept.active !== false,
			],
		);
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		await this.pool.query(
			`INSERT INTO dict_namespaces (code, description, is_public, is_external_private, is_mutable)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(code) DO UPDATE SET
        description=EXCLUDED.description,
        is_public=EXCLUDED.is_public,
        is_external_private=EXCLUDED.is_external_private,
        is_mutable=EXCLUDED.is_mutable`,
			[
				namespace.code,
				namespace.description || null,
				namespace.isPublic,
				namespace.isExternalPrivate,
				namespace.isMutable !== false,
			],
		);
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		await this.pool.query(
			`INSERT INTO dict_relations (id, concept_id, linked_id, relationship_type, active, designation_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        concept_id=EXCLUDED.concept_id,
        linked_id=EXCLUDED.linked_id,
        relationship_type=EXCLUDED.relationship_type,
        active=EXCLUDED.active,
        designation_date=EXCLUDED.designation_date`,
			[
				relation.id,
				relation.conceptId,
				relation.linkedId,
				relation.relationshipType,
				relation.active !== false,
				relation.designationDate || null,
			],
		);
		await this.invalidateRelationCache(relation.conceptId);
		await this.invalidateRelationCache(relation.linkedId);
	}

	async invalidateRelationCache(conceptId?: string): Promise<void> {
		if (conceptId) {
			await this.pool.query(
				`DELETE FROM dict_relation_cache WHERE ancestor_concept_id = $1 OR descendant_concept_id = $2`,
				[conceptId, conceptId],
			);
		} else {
			await this.pool.query(`DELETE FROM dict_relation_cache`);
		}
	}

	async getRelations(
		conceptId: string,
		direction: TraversalDirection = "both",
	): Promise<ConceptRelation[]> {
		const sqlParts: string[] = [];
		const params: any[] = [];

		if (direction === "forward" || direction === "both") {
			sqlParts.push(
				`SELECT id, concept_id, linked_id, relationship_type, active, designation_date FROM dict_relations WHERE concept_id = $1 AND active = TRUE`,
			);
			params.push(conceptId);
		}

		if (direction === "reverse" || direction === "both") {
			sqlParts.push(
				`SELECT id, concept_id, linked_id, relationship_type, active, designation_date FROM dict_relations WHERE linked_id = $1 AND active = TRUE`,
			);
			params.push(conceptId);
		}

		if (sqlParts.length === 0) return [];
		const res = await this.pool.query(sqlParts.join(" UNION ALL "), params);

		return res.rows.map((r: any) => ({
			id: r.id,
			conceptId: r.concept_id,
			linkedId: r.linked_id,
			relationshipType: r.relationship_type,
			active: r.active,
			designationDate: r.designation_date || undefined,
		}));
	}

	async getRelatedConcepts(
		conceptId: string,
		direction: TraversalDirection = "both",
		maxDepth = 3,
		useCache = true,
	): Promise<RelatedConceptResult[]> {
		// 1. Check cache table first if useCache is enabled
		if (useCache) {
			const cachedRes = await this.pool.query(
				`SELECT c.*, rc.link_depth, rc.inferred_relationship_type 
        FROM dict_relation_cache rc 
        JOIN dict_concepts c ON rc.descendant_concept_id = c.id 
        WHERE rc.ancestor_concept_id = $1 AND rc.active = TRUE AND rc.link_depth <= $2`,
				[conceptId, maxDepth],
			);

			if (cachedRes.rows.length > 0) {
				return cachedRes.rows.map((r: any) => ({
					concept: {
						id: r.id,
						namespaceCode: r.namespace_code,
						standardCode: r.standard_code,
						display: r.display,
						description: r.description || undefined,
						designationDate: r.designation_date || undefined,
						active: r.active,
					},
					relationshipType: r.inferred_relationship_type,
					direction: "forward",
					depth: r.link_depth,
				}));
			}
		}

		// 2. SQL Recursive CTE for Graph Traversal with Operator Inversion
		const cteSql = `
      WITH RECURSIVE rel_graph(target_id, relationship_type, dir, depth) AS (
        -- Forward direct
        SELECT linked_id, relationship_type, 'forward', 1
        FROM dict_relations
        WHERE concept_id = $1 AND active = TRUE AND ($2 = 'forward' OR $2 = 'both')

        UNION ALL

        -- Reverse direct with operator inversion
        SELECT concept_id, 
               CASE relationship_type 
                 WHEN 'NARROWER_THAN' THEN 'WIDER_THAN' 
                 WHEN 'WIDER_THAN' THEN 'NARROWER_THAN' 
                 ELSE 'EQUIVALENT' 
               END, 
               'reverse', 1
        FROM dict_relations
        WHERE linked_id = $3 AND active = TRUE AND ($4 = 'reverse' OR $4 = 'both')

        UNION ALL

        -- Recursive forward expansion
        SELECT r.linked_id, r.relationship_type, g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.concept_id
        WHERE r.active = TRUE AND g.depth < $5 AND g.dir = 'forward'

        UNION ALL

        -- Recursive reverse expansion
        SELECT r.concept_id, 
               CASE r.relationship_type 
                 WHEN 'NARROWER_THAN' THEN 'WIDER_THAN' 
                 WHEN 'WIDER_THAN' THEN 'NARROWER_THAN' 
                 ELSE 'EQUIVALENT' 
               END, 
               g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.linked_id
        WHERE r.active = TRUE AND g.depth < $6 AND g.dir = 'reverse'
      )
      SELECT DISTINCT g.target_id, g.relationship_type, g.dir, g.depth, c.* 
      FROM rel_graph g
      JOIN dict_concepts c ON g.target_id = c.id
      WHERE c.active = TRUE;
    `;

		const rows = await this.pool.query(cteSql, [
			conceptId,
			direction,
			conceptId,
			direction,
			maxDepth,
			maxDepth,
		]);

		const results: RelatedConceptResult[] = rows.rows.map((r: any) => ({
			concept: {
				id: r.id,
				namespaceCode: r.namespace_code,
				standardCode: r.standard_code,
				display: r.display,
				description: r.description || undefined,
				designationDate: r.designation_date || undefined,
				active: r.active,
			},
			relationshipType: r.relationship_type,
			direction: r.dir,
			depth: r.depth,
		}));

		// Populate cache
		if (useCache && results.length > 0) {
			const now = new Date().toISOString();
			for (const res of results) {
				await this.pool.query(
					`INSERT INTO dict_relation_cache (ancestor_concept_id, descendant_concept_id, link_depth, inferred_relationship_type, active, updated_at)
          VALUES ($1, $2, $3, $4, TRUE, $5)
          ON CONFLICT(ancestor_concept_id, descendant_concept_id, inferred_relationship_type) DO UPDATE SET
            link_depth=EXCLUDED.link_depth,
            inferred_relationship_type=EXCLUDED.inferred_relationship_type,
            active=EXCLUDED.active,
            updated_at=EXCLUDED.updated_at`,
					[conceptId, res.concept.id, res.depth, res.relationshipType, now],
				);
			}
		}

		return results;
	}
}

// ── PG Persistent Expression Store ────────────────────────────

export class PgPersistentExpressionStore implements PersistentExpressionStore {
	private pool: Pool;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });

		this.pool.query(`
      CREATE TABLE IF NOT EXISTS dict_custom_expressions (
        id TEXT PRIMARY KEY,
        term TEXT NOT NULL,
        concept_id TEXT,
        scope_level TEXT NOT NULL,
        scope_id TEXT,
        data JSONB NOT NULL
      )
    `);
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		await this.pool.query(
			`INSERT INTO dict_custom_expressions (id, term, concept_id, scope_level, scope_id, data)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        term=EXCLUDED.term,
        concept_id=EXCLUDED.concept_id,
        scope_level=EXCLUDED.scope_level,
        scope_id=EXCLUDED.scope_id,
        data=EXCLUDED.data`,
			[
				expression.id,
				expression.term,
				expression.conceptId || null,
				scope.level,
				scopeId,
				JSON.stringify(expression),
			],
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		await this.pool.query(
			"DELETE FROM dict_custom_expressions WHERE id = $1 AND scope_level = $2 AND (scope_id = $3 OR scope_id IS NULL)",
			[id, scope.level, scopeId],
		);
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		let sql =
			"SELECT data FROM dict_custom_expressions WHERE (scope_level = $1 AND (scope_id = $2 OR scope_id IS NULL))";
		const params: any[] = [scope.level, scopeId];

		if (includeGlobal && scope.level !== "global") {
			sql += " OR scope_level = 'global'";
		}

		const res = await this.pool.query(sql, params);
		return res.rows.map((r: any) => r.data);
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const res = await this.pool.query(
			"SELECT data FROM dict_custom_expressions WHERE id = $1",
			[id],
		);
		const row = res.rows[0];
		return row ? row.data : null;
	}
}

// Register Postgres repo adapter
registerAdapter("pg", {
	create: async (options) => {
		const connStr = String(
			options.connection ||
				options.connectionString ||
				"postgresql://localhost:5432/postgres",
		);
		return {
			sessionFilter: new PgFilterStore(connStr),
			persistentFilter: new PgFilterStore(connStr),
			sessionObject: new PgObjectStore(connStr),
			persistentObject: new PgObjectStore(connStr),
			sessionEvent: new PgEventStore(connStr),
			persistentEvent: new PgEventStore(connStr),
			sessionForm: new PgFormStore(connStr),
			persistentForm: new PgFormStore(connStr),
			conceptStore: new PgConceptStore(connStr),
			persistentExpressionStore: new PgPersistentExpressionStore(connStr),
		};
	},
});
