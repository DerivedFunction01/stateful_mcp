import { Database } from "bun:sqlite";
import type { OwnerScope } from "../../config/types";
import type { FilterState, FilterCondition } from "../../middleware/filter/types";
import type {
  SessionFilterStore,
  PersistentFilterStore,
  PersistedFilterState,
} from "./interfaces";
import { registerAdapter } from "../../config/loader";
import * as path from "path";
import * as fs from "fs";

export class SqliteFilterStore implements SessionFilterStore, PersistentFilterStore {
  private db: Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run("PRAGMA journal_mode = WAL;");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS filters (
        filter_id         TEXT PRIMARY KEY,
        tool_name         TEXT NULL,
        table_name        TEXT NULL,
        parent_filter_id  TEXT NULL,
        scope_level       TEXT NOT NULL DEFAULT 'session',
        session_id        TEXT NULL,
        user_id           TEXT NULL,
        combined_operation TEXT NULL,
        combined_ids      TEXT NULL,
        schema_snapshot   TEXT NULL,
        created_at        TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS filter_rules (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        filter_id    TEXT NOT NULL,
        property     TEXT NOT NULL,
        operator     TEXT NOT NULL,
        value        TEXT NOT NULL,
        index_order  INTEGER NOT NULL,
        UNIQUE(filter_id, index_order),
        FOREIGN KEY(filter_id) REFERENCES filters(filter_id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS saved_filters (
        id           TEXT PRIMARY KEY,
        tags         TEXT NOT NULL,
        description  TEXT NOT NULL,
        scope_level  TEXT NOT NULL,
        user_id      TEXT NULL,
        saved_at     TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_filters_session ON filters(session_id, scope_level);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_filters_scope ON filters(scope_level, user_id);");
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

  // ─── Internal Session Operations ───────────────────────────────────────────

  private async getSession(sessionId: string, id: string): Promise<FilterState | null> {
    const row = this.db.query("SELECT * FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'")
      .get(sessionId, id) as any;

    if (!row) return null;

    const rulesRows = this.db.query("SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC")
      .all(id) as any[];

    const rules: FilterCondition[] = rulesRows.map(r => ({
      property: r.property,
      operator: r.operator as any,
      value: JSON.parse(r.value)
    }));

    return {
      filterId: row.filter_id,
      toolName: row.tool_name || undefined,
      tableName: row.table_name || undefined,
      rules,
      parentFilterId: row.parent_filter_id,
      createdAt: row.created_at,
      combined_operation: row.combined_operation as any,
      combined_ids: row.combined_ids ? JSON.parse(row.combined_ids) : null,
      schema_snapshot: row.schema_snapshot ? JSON.parse(row.schema_snapshot) : null
    };
  }

  private async setSession(sessionId: string, id: string, state: FilterState): Promise<void> {
    const combinedIdsStr = state.combined_ids ? JSON.stringify(state.combined_ids) : null;
    const schemaSnapshotStr = state.schema_snapshot ? JSON.stringify(state.schema_snapshot) : null;

    const runTx = this.db.transaction(() => {
      this.db.run(
        `INSERT INTO filters (filter_id, tool_name, table_name, parent_filter_id, scope_level, session_id, user_id, combined_operation, combined_ids, schema_snapshot)
         VALUES (?, ?, ?, ?, 'session', ?, NULL, ?, ?, ?)
         ON CONFLICT(filter_id) DO UPDATE SET
           tool_name=excluded.tool_name,
           table_name=excluded.table_name,
           parent_filter_id=excluded.parent_filter_id,
           scope_level=excluded.scope_level,
           session_id=excluded.session_id,
           user_id=excluded.user_id,
           combined_operation=excluded.combined_operation,
           combined_ids=excluded.combined_ids,
           schema_snapshot=excluded.schema_snapshot`,
        [
          id,
          state.toolName || null,
          state.tableName || null,
          state.parentFilterId || null,
          sessionId,
          state.combined_operation || null,
          combinedIdsStr,
          schemaSnapshotStr
        ]
      );

      this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
      state.rules.forEach((rule, idx) => {
        this.db.run(
          "INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)",
          [id, rule.property, rule.operator, JSON.stringify(rule.value), idx]
        );
      });
    });

    runTx();
  }

  private async deleteSession(sessionId: string, id: string): Promise<void> {
    const runTx = this.db.transaction(() => {
      this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
      this.db.run("DELETE FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'", [sessionId, id]);
    });
    runTx();
  }

  // ─── Internal Persistent Operations ────────────────────────────────────────

  private async getPersistent(id: string, scope: OwnerScope): Promise<PersistedFilterState | null> {
    const scopeId = scope.level === "user" ? scope.userId : null;
    
    const saved = this.db.query("SELECT * FROM saved_filters WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)")
      .get(id, scope.level, scopeId) as any;

    if (!saved) return null;

    const row = this.db.query("SELECT * FROM filters WHERE filter_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)")
      .get(id, scope.level, scopeId) as any;

    if (!row) return null;

    const rulesRows = this.db.query("SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC")
      .all(id) as any[];

    const rules: FilterCondition[] = rulesRows.map(r => ({
      property: r.property,
      operator: r.operator as any,
      value: JSON.parse(r.value)
    }));

    return {
      filterId: row.filter_id,
      toolName: row.tool_name || undefined,
      tableName: row.table_name || undefined,
      rules,
      parentFilterId: row.parent_filter_id,
      createdAt: row.created_at,
      combined_operation: row.combined_operation as any,
      combined_ids: row.combined_ids ? JSON.parse(row.combined_ids) : null,
      tags: JSON.parse(saved.tags),
      description: saved.description,
      schema_snapshot: row.schema_snapshot || "{}"
    };
  }

  private async setPersistent(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void> {
    const scopeId = scope.level === "user" ? scope.userId : null;
    const combinedIdsStr = state.combined_ids ? JSON.stringify(state.combined_ids) : null;

    const runTx = this.db.transaction(() => {
      this.db.run(
        `INSERT INTO filters (filter_id, tool_name, table_name, parent_filter_id, scope_level, session_id, user_id, combined_operation, combined_ids, schema_snapshot)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
         ON CONFLICT(filter_id) DO UPDATE SET
           tool_name=excluded.tool_name,
           table_name=excluded.table_name,
           parent_filter_id=excluded.parent_filter_id,
           scope_level=excluded.scope_level,
           session_id=excluded.session_id,
           user_id=excluded.user_id,
           combined_operation=excluded.combined_operation,
           combined_ids=excluded.combined_ids,
           schema_snapshot=excluded.schema_snapshot`,
        [
          id,
          state.toolName || null,
          state.tableName || null,
          state.parentFilterId || null,
          scope.level,
          scopeId,
          state.combined_operation || null,
          combinedIdsStr,
          state.schema_snapshot
        ]
      );

      this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
      state.rules.forEach((rule, idx) => {
        this.db.run(
          "INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)",
          [id, rule.property, rule.operator, JSON.stringify(rule.value), idx]
        );
      });

      this.db.run(
        `INSERT INTO saved_filters (id, tags, description, scope_level, user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tags=excluded.tags,
           description=excluded.description,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id`,
        [id, JSON.stringify(state.tags), state.description, scope.level, scopeId]
      );
    });

    runTx();
  }

  private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
    const runTx = this.db.transaction(() => {
      this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
      this.db.run("DELETE FROM saved_filters WHERE id = ?", [id]);
      this.db.run("DELETE FROM filters WHERE filter_id = ? AND scope_level = ?", [id, scope.level]);
    });
    runTx();
  }

  // ─── Additional Interface Methods ──────────────────────────────────────────

  async listSession(sessionId: string): Promise<string[]> {
    const rows = this.db.query("SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session'")
      .all(sessionId) as any[];
    return rows.map(r => r.filter_id);
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    const rows = this.db.query("SELECT filter_id FROM filters WHERE session_id = ? AND parent_filter_id = ? AND scope_level = 'session'")
      .all(sessionId, parentId) as any[];
    return rows.map(r => r.filter_id);
  }

  async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
    if (olderThanMs !== undefined) {
      const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
      const rows = this.db.query("SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session' AND created_at < ?")
        .all(sessionId, olderThanDate) as any[];

      const runTx = this.db.transaction(() => {
        rows.forEach(r => {
          this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [r.filter_id]);
          this.db.run("DELETE FROM filters WHERE filter_id = ?", [r.filter_id]);
        });
      });
      runTx();
    } else {
      const runTx = this.db.transaction(() => {
        this.db.run("DELETE FROM filter_rules WHERE filter_id IN (SELECT filter_id FROM filters WHERE session_id = ?)", [sessionId]);
        this.db.run("DELETE FROM filters WHERE session_id = ? AND scope_level = 'session'", [sessionId]);
      });
      runTx();
    }
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]> {
    const scopeId = scope.level === "user" ? scope.userId : null;
    const allSaved = this.db.query("SELECT * FROM saved_filters WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)")
      .all(scope.level, scopeId) as any[];

    const results: PersistedFilterState[] = [];
    for (const saved of allSaved) {
      const tags: string[] = JSON.parse(saved.tags);
      if (tags.includes(tag)) {
        const fullState = await this.getPersistent(saved.id, scope);
        if (fullState) results.push(fullState);
      }
    }
    return results;
  }

  async list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
    const userScopeId = scope.level === "user" ? scope.userId : null;
    
    let queryStr = "SELECT id, scope_level, user_id FROM saved_filters WHERE (scope_level = ? AND user_id = ?)";
    const params: any[] = [scope.level, userScopeId];

    if (scope.level === "user" && includeGlobal) {
      queryStr += " OR (scope_level = 'global')";
    }

    const savedRecords = this.db.query(queryStr).all(...params) as any[];

    const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
    for (const r of savedRecords) {
      const recordScope: OwnerScope = r.scope_level === "user" 
        ? { level: "user", userId: r.user_id } 
        : { level: "global" };
        
      const state = await this.getPersistent(r.id, recordScope);
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

// Register SQLite repo adapter
registerAdapter("sqlite", {
  create: async (options) => {
    const dbPath = String(options.path || "./sqlite.db");
    return new SqliteFilterStore(dbPath);
  }
});
