import { Database } from "bun:sqlite";
import type { OwnerScope } from "../../config/types";
import type { FilterState, FilterCondition } from "../../middleware/filter/types";
import type {
  SessionFilterStore,
  PersistentFilterStore,
  PersistedFilterState,
  SessionFormStore,
  PersistentFormStore,
  PersistedFormStateDetails,
} from "./interfaces";
import type { FormState } from "../../middleware/form/types";
import { registerAdapter } from "../../config/loader";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_aliases (
        session_id  TEXT NOT NULL,
        alias_name  TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        PRIMARY KEY (session_id, alias_name)
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

  async getAlias(sessionId: string, alias: string): Promise<string | null> {
    const row = this.db.query("SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?")
      .get(sessionId, alias) as any;
    return row ? row.target_id : null;
  }

  async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    this.db.run(
      `INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`,
      [sessionId, alias, targetId]
    );
  }

  async deleteAlias(sessionId: string, alias: string): Promise<void> {
    this.db.run("DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?", [sessionId, alias]);
  }

  async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
    const rows = this.db.query("SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?")
      .all(sessionId) as any[];
    return rows.map(r => ({ alias: r.alias_name, targetId: r.target_id }));
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

  async list(scope: OwnerScope, includeGlobal?: boolean): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
    const userId = scope.level === "user" ? scope.userId : null;
    let queryStr = "SELECT id, scope_level, user_id FROM saved_filters WHERE (scope_level = 'global')";
    const params: any[] = [];
    if (scope.level === "user") {
      if (includeGlobal) {
        queryStr += " OR (scope_level = 'user' AND user_id = ?)";
        params.push(userId);
      } else {
        queryStr = "SELECT id, scope_level, user_id FROM saved_filters WHERE scope_level = 'user' AND user_id = ?";
        params.push(userId);
      }
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

// ── SQLite Form Store ────────────────────────────────────────────────────────
export class SqliteFormStore implements SessionFormStore, PersistentFormStore {
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
      CREATE TABLE IF NOT EXISTS forms (
        form_id          TEXT PRIMARY KEY,
        parent_form_id   TEXT NULL,
        schema_name      TEXT NOT NULL,
        scope_level      TEXT NOT NULL DEFAULT 'session',
        session_id       TEXT NULL,
        user_id          TEXT NULL,
        created_at       TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS form_answers (
        form_id      TEXT NOT NULL,
        question_id  TEXT NOT NULL,
        value        TEXT NOT NULL,
        PRIMARY KEY(form_id, question_id),
        FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS form_skipped (
        form_id      TEXT NOT NULL,
        question_id  TEXT NOT NULL,
        PRIMARY KEY(form_id, question_id),
        FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS form_stale (
        form_id      TEXT NOT NULL,
        question_id  TEXT NOT NULL,
        PRIMARY KEY(form_id, question_id),
        FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS saved_forms (
        id           TEXT PRIMARY KEY,
        tags         TEXT NOT NULL,
        description  TEXT NOT NULL,
        scope_level  TEXT NOT NULL,
        user_id      TEXT NULL,
        saved_at     TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS form_session_aliases (
        session_id  TEXT NOT NULL,
        alias_name  TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        PRIMARY KEY (session_id, alias_name)
      );
    `);
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

  private async getSession(sessionId: string, id: string): Promise<FormState | null> {
    const row = this.db.query("SELECT * FROM forms WHERE form_id = ? AND session_id = ?").get(id, sessionId) as any;
    if (!row) return null;
    return this.loadState(row);
  }

  private async getPersistent(id: string, scope: OwnerScope): Promise<PersistedFormStateDetails | null> {
    const row = this.db.query("SELECT * FROM forms WHERE form_id = ? AND scope_level = ?").get(
      id,
      scope.level
    ) as any;
    if (!row) return null;

    const saved = this.db.query("SELECT * FROM saved_forms WHERE id = ?").get(id) as any;
    const tags = saved ? JSON.parse(saved.tags) : [];
    const description = saved ? saved.description : "";

    const state = await this.loadState(row);
    return {
      ...state,
      tags,
      description,
      schema_pinned_at: row.created_at
    };
  }

  private loadState(row: any): FormState {
    const formId = row.form_id;
    const answersRows = this.db.query("SELECT * FROM form_answers WHERE form_id = ?").all(formId) as any[];
    const skippedRows = this.db.query("SELECT * FROM form_skipped WHERE form_id = ?").all(formId) as any[];
    const staleRows = this.db.query("SELECT * FROM form_stale WHERE form_id = ?").all(formId) as any[];

    const answers: Record<string, any> = {};
    for (const r of answersRows) {
      answers[r.question_id] = JSON.parse(r.value);
    }

    const skipped = skippedRows.map(r => r.question_id);
    
    const stale: Record<string, boolean> = {};
    for (const r of staleRows) {
      stale[r.question_id] = true;
    }

    return {
      formId,
      parentFormId: row.parent_form_id,
      schemaName: row.schema_name,
      answers,
      skipped,
      stale,
      timestamp: row.created_at
    };
  }

  set(sessionId: string, id: string, state: FormState): Promise<void>;
  set(id: string, state: PersistedFormStateDetails, scope: OwnerScope): Promise<void>;
  async set(a: string, b: any, c?: any): Promise<void> {
    if (c && typeof c === "object" && "level" in c) {
      await this.setPersistent(a, b, c);
    } else {
      await this.setSession(a, b, c);
    }
  }

  private async setSession(sessionId: string, id: string, state: FormState): Promise<void> {
    this.db.transaction(() => {
      this.db.query(`
        INSERT OR REPLACE INTO forms (form_id, parent_form_id, schema_name, scope_level, session_id, created_at)
        VALUES (?, ?, ?, 'session', ?, ?)
      `).run(id, state.parentFormId, state.schemaName, sessionId, state.timestamp);

      this.db.query("DELETE FROM form_answers WHERE form_id = ?").run(id);
      for (const [qId, val] of Object.entries(state.answers)) {
        this.db.query("INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)")
          .run(id, qId, JSON.stringify(val));
      }

      this.db.query("DELETE FROM form_skipped WHERE form_id = ?").run(id);
      for (const qId of state.skipped) {
        this.db.query("INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)")
          .run(id, qId);
      }

      this.db.query("DELETE FROM form_stale WHERE form_id = ?").run(id);
      for (const qId of Object.keys(state.stale)) {
        this.db.query("INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)")
          .run(id, qId);
      }
    })();
  }

  private async setPersistent(id: string, state: PersistedFormStateDetails, scope: OwnerScope): Promise<void> {
    const userId = scope.level === "user" ? scope.userId : null;
    this.db.transaction(() => {
      this.db.query(`
        INSERT OR REPLACE INTO forms (form_id, parent_form_id, schema_name, scope_level, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, state.parentFormId, state.schemaName, scope.level, userId, state.timestamp);

      this.db.query("DELETE FROM form_answers WHERE form_id = ?").run(id);
      for (const [qId, val] of Object.entries(state.answers)) {
        this.db.query("INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)")
          .run(id, qId, JSON.stringify(val));
      }

      this.db.query("DELETE FROM form_skipped WHERE form_id = ?").run(id);
      for (const qId of state.skipped) {
        this.db.query("INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)")
          .run(id, qId);
      }

      this.db.query("DELETE FROM form_stale WHERE form_id = ?").run(id);
      for (const qId of Object.keys(state.stale)) {
        this.db.query("INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)")
          .run(id, qId);
      }

      this.db.query(`
        INSERT OR REPLACE INTO saved_forms (id, tags, description, scope_level, user_id, saved_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, JSON.stringify(state.tags), state.description, scope.level, userId, state.timestamp);
    })();
  }

  async delete(sessionId: string, id: string): Promise<void>;
  async delete(id: string, scope: OwnerScope): Promise<void>;
  async delete(a: string, b?: any): Promise<void> {
    const query = this.db.query("DELETE FROM forms WHERE form_id = ?");
    query.run(a);
    this.db.query("DELETE FROM saved_forms WHERE id = ?").run(a);
  }

  async listSession(sessionId: string): Promise<string[]> {
    const rows = this.db.query("SELECT form_id FROM forms WHERE session_id = ? AND scope_level = 'session'").all(sessionId) as any[];
    return rows.map(r => r.form_id);
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    const rows = this.db.query("SELECT form_id FROM forms WHERE session_id = ? AND parent_form_id = ?").all(sessionId, parentId) as any[];
    return rows.map(r => r.form_id);
  }

  async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
    if (olderThanMs !== undefined) {
      const now = Date.now();
      const cutoff = new Date(now - olderThanMs).toISOString();
      this.db.query("DELETE FROM forms WHERE session_id = ? AND created_at < ?").run(sessionId, cutoff);
    } else {
      this.db.query("DELETE FROM forms WHERE session_id = ?").run(sessionId);
    }
  }

  async create(sessionId: string, state: Omit<FormState, "formId"> & { formId?: string }, alias?: string): Promise<string> {
    const id = state.formId || `form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const fullState: FormState = { ...state, formId: id };
    await this.set(sessionId, id, fullState);
    if (alias) {
      await this.setAlias(sessionId, alias, id);
    }
    return id;
  }

  async getAlias(sessionId: string, alias: string): Promise<string | null> {
    const row = this.db.query("SELECT target_id FROM form_session_aliases WHERE session_id = ? AND alias_name = ?").get(sessionId, alias) as any;
    return row ? row.target_id : null;
  }

  async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    this.db.query("INSERT OR REPLACE INTO form_session_aliases (session_id, alias_name, target_id) VALUES (?, ?, ?)")
      .run(sessionId, alias, targetId);
  }

  async deleteAlias(sessionId: string, alias: string): Promise<void> {
    this.db.query("DELETE FROM form_session_aliases WHERE session_id = ? AND alias_name = ?").run(sessionId, alias);
  }

  async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
    const rows = this.db.query("SELECT alias_name, target_id FROM form_session_aliases WHERE session_id = ?").all(sessionId) as any[];
    return rows.map(r => ({ alias: r.alias_name, targetId: r.target_id }));
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<PersistedFormStateDetails[]> {
    const userId = scope.level === "user" ? scope.userId : null;
    const query = scope.level === "user"
      ? "SELECT id FROM saved_forms WHERE scope_level = 'user' AND user_id = ? AND tags LIKE ?"
      : "SELECT id FROM saved_forms WHERE scope_level = 'global' AND tags LIKE ?";
    
    const params = scope.level === "user" ? [userId, `%${tag}%`] : [`%${tag}%`];
    const rows = this.db.query(query).all(...params) as any[];
    
    const results: PersistedFormStateDetails[] = [];
    for (const r of rows) {
      const state = await this.getPersistent(r.id, scope);
      if (state) results.push(state);
    }
    return results;
  }

  async list(scope: OwnerScope, includeGlobal?: boolean): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
    const userId = scope.level === "user" ? scope.userId : null;
    let queryStr = "SELECT id, scope_level, user_id FROM saved_forms WHERE (scope_level = 'global')";
    const params: any[] = [];
    if (scope.level === "user") {
      if (includeGlobal) {
        queryStr += " OR (scope_level = 'user' AND user_id = ?)";
        params.push(userId);
      } else {
        queryStr = "SELECT id, scope_level, user_id FROM saved_forms WHERE scope_level = 'user' AND user_id = ?";
        params.push(userId);
      }
    }

    const savedRecords = this.db.query(queryStr).all(...params) as any[];
    const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> = [];
    for (const r of savedRecords) {
      const recordScope: OwnerScope = r.scope_level === "user" 
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

// Register SQLite repo adapter
registerAdapter("sqlite", {
  create: async (options) => {
    const dbPath = String(options.path || "./sqlite.db");
    return new SqliteFilterStore(dbPath);
  }
});
