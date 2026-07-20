import { Pool } from "pg";
import type { OwnerScope } from "../../config/types";
import type { FilterState, FilterCondition } from "../../middleware/filter/types";
import type {
  SessionFilterStore,
  PersistentFilterStore,
  PersistedFilterState,
} from "./interfaces";
import { registerAdapter } from "../../config/loader";
import * as crypto from "crypto";

export class PgFilterStore implements SessionFilterStore, PersistentFilterStore {
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

      await client.query("CREATE INDEX IF NOT EXISTS idx_pg_filters_session ON filters(session_id, scope_level);");
      await client.query("CREATE INDEX IF NOT EXISTS idx_pg_filters_scope ON filters(scope_level, user_id);");

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
  set(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void>;
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
      [sessionId, alias]
    );
    return res.rows[0] ? res.rows[0].target_id : null;
  }

  async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES ($1, $2, $3)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=EXCLUDED.target_id`,
      [sessionId, alias, targetId]
    );
  }

  async deleteAlias(sessionId: string, alias: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM session_aliases WHERE session_id = $1 AND alias_name = $2",
      [sessionId, alias]
    );
  }

  async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
    const res = await this.pool.query(
      "SELECT alias_name, target_id FROM session_aliases WHERE session_id = $1",
      [sessionId]
    );
    return res.rows.map((r: any) => ({ alias: r.alias_name, targetId: r.target_id }));
  }

  async create(sessionId: string, state: Omit<FilterState, "filterId"> & { filterId?: string }, alias?: string): Promise<string> {
    const id = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const fullState: FilterState = { ...state, filterId: id };
    await this.setSession(sessionId, id, fullState);
    if (alias) {
      await this.setAlias(sessionId, alias, id);
    }
    return id;
  }

  // ─── Internal Session Operations ───────────────────────────────────────────

  private async getSession(sessionId: string, id: string): Promise<FilterState | null> {
    const res = await this.pool.query(
      "SELECT * FROM filters WHERE session_id = $1 AND filter_id = $2 AND scope_level = 'session'",
      [sessionId, id]
    );
    const row = res.rows[0];
    if (!row) return null;

    const rulesRes = await this.pool.query(
      "SELECT property, operator, value FROM filter_rules WHERE filter_id = $1 ORDER BY index_order ASC",
      [id]
    );

    const rules: FilterCondition[] = rulesRes.rows.map((r: any) => ({
      property: r.property,
      operator: r.operator as any,
      value: r.value
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
      schema_snapshot: row.schema_snapshot
    };
  }

  private async setSession(sessionId: string, id: string, state: FilterState): Promise<void> {
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
          state.schema_snapshot ? JSON.stringify(state.schema_snapshot) : null
        ]
      );

      await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [id]);
      for (let i = 0; i < state.rules.length; i++) {
        const rule = state.rules[i]!;
        await client.query(
          "INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES ($1, $2, $3, $4, $5)",
          [id, rule.property, rule.operator, JSON.stringify(rule.value), i]
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
      await client.query("DELETE FROM filters WHERE session_id = $1 AND filter_id = $2 AND scope_level = 'session'", [sessionId, id]);
      await client.query("COMMIT;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Internal Persistent Operations ────────────────────────────────────────

  private async getPersistent(id: string, scope: OwnerScope): Promise<PersistedFilterState | null> {
    const scopeId = scope.level === "user" ? scope.userId : null;
    
    const savedRes = await this.pool.query(
      "SELECT * FROM saved_filters WHERE id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
      [id, scope.level, scopeId]
    );
    const saved = savedRes.rows[0];
    if (!saved) return null;

    const filterRes = await this.pool.query(
      "SELECT * FROM filters WHERE filter_id = $1 AND scope_level = $2 AND (user_id = $3 OR user_id IS NULL)",
      [id, scope.level, scopeId]
    );
    const row = filterRes.rows[0];
    if (!row) return null;

    const rulesRes = await this.pool.query(
      "SELECT property, operator, value FROM filter_rules WHERE filter_id = $1 ORDER BY index_order ASC",
      [id]
    );

    const rules: FilterCondition[] = rulesRes.rows.map((r: any) => ({
      property: r.property,
      operator: r.operator as any,
      value: r.value
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
      schema_snapshot: row.schema_snapshot ? JSON.stringify(row.schema_snapshot) : "{}"
    };
  }

  private async setPersistent(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void> {
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
          state.schema_snapshot
        ]
      );

      await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [id]);
      for (let i = 0; i < state.rules.length; i++) {
        const rule = state.rules[i]!;
        await client.query(
          "INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES ($1, $2, $3, $4, $5)",
          [id, rule.property, rule.operator, JSON.stringify(rule.value), i]
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
        [id, JSON.stringify(state.tags), state.description, scope.level, scopeId]
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
      await client.query("DELETE FROM filters WHERE filter_id = $1 AND scope_level = $2", [id, scope.level]);
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
      [sessionId]
    );
    return res.rows.map((r: any) => r.filter_id);
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    const res = await this.pool.query(
      "SELECT filter_id FROM filters WHERE session_id = $1 AND parent_filter_id = $2 AND scope_level = 'session'",
      [sessionId, parentId]
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
          [sessionId, cutoff]
        );
        for (const r of rows.rows) {
          await client.query("DELETE FROM filter_rules WHERE filter_id = $1", [r.filter_id]);
          await client.query("DELETE FROM filters WHERE filter_id = $1", [r.filter_id]);
        }
      } else {
        await client.query(
          "DELETE FROM filter_rules WHERE filter_id IN (SELECT filter_id FROM filters WHERE session_id = $1)",
          [sessionId]
        );
        await client.query("DELETE FROM filters WHERE session_id = $1 AND scope_level = 'session'", [sessionId]);
      }
      await client.query("COMMIT;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]> {
    const scopeId = scope.level === "user" ? scope.userId : null;
    const res = await this.pool.query(
      "SELECT id, tags FROM saved_filters WHERE scope_level = $1 AND (user_id = $2 OR user_id IS NULL)",
      [scope.level, scopeId]
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
    includeGlobal?: boolean
  ): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
    const userScopeId = scope.level === "user" ? scope.userId : null;
    
    let queryStr = "SELECT id, scope_level, user_id FROM saved_filters WHERE (scope_level = $1 AND user_id = $2)";
    const params: any[] = [scope.level, userScopeId];

    if (scope.level === "user" && includeGlobal) {
      queryStr += " OR (scope_level = 'global')";
    }

    const res = await this.pool.query(queryStr, params);

    const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
    for (const r of res.rows) {
      const recordScope: OwnerScope = r.scope_level === "user" 
        ? { level: "user", userId: r.user_id } 
        : { level: "global" };
        
      const state = await this.get(r.id, recordScope);
      if (state) {
        results.push({
          ...state,
          scope: recordScope
        });
      }
    }
    return results;
  }
}

// Register Postgres repo adapter
registerAdapter("pg", {
  create: async (options) => {
    const connStr = String(options.connection || options.connectionString || "postgresql://localhost:5432/postgres");
    return new PgFilterStore(connStr);
  }
});
