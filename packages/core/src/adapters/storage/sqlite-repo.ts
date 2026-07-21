import { Database } from "bun:sqlite";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
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
import type {
	FilterCondition,
	FilterState,
} from "../../middleware/filter/types";
import type { FormState } from "../../middleware/form/types";
import type {
	PersistedFilterState,
	PersistedFormStateDetails,
	PersistentFilterStore,
	PersistentFormStore,
	SessionFilterStore,
	SessionFormStore,
} from "./interfaces";

export class SqliteFilterStore
	implements SessionFilterStore, PersistentFilterStore
{
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

		this.db.run(
			"CREATE INDEX IF NOT EXISTS idx_filters_session ON filters(session_id, scope_level);",
		);
		this.db.run(
			"CREATE INDEX IF NOT EXISTS idx_filters_scope ON filters(scope_level, user_id);",
		);
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
		const row = this.db
			.query(
				"SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			)
			.get(sessionId, alias) as any;
		return row ? row.target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.db.run(
			`INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.db.run(
			"DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const rows = this.db
			.query(
				"SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?",
			)
			.all(sessionId) as any[];
		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
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
		const row = this.db
			.query(
				"SELECT * FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'",
			)
			.get(sessionId, id) as any;

		if (!row) return null;

		const rulesRows = this.db
			.query(
				"SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC",
			)
			.all(id) as any[];

		const rules: FilterCondition[] = rulesRows.map((r) => ({
			property: r.property,
			operator: r.operator as any,
			value: JSON.parse(r.value),
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
			schema_snapshot: row.schema_snapshot
				? JSON.parse(row.schema_snapshot)
				: null,
		};
	}

	private async setSession(
		sessionId: string,
		id: string,
		state: FilterState,
	): Promise<void> {
		const combinedIdsStr = state.combined_ids
			? JSON.stringify(state.combined_ids)
			: null;
		const schemaSnapshotStr = state.schema_snapshot
			? JSON.stringify(state.schema_snapshot)
			: null;

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
					schemaSnapshotStr,
				],
			);

			this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			state.rules.forEach((rule, idx) => {
				this.db.run(
					"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)",
					[id, rule.property, rule.operator, JSON.stringify(rule.value), idx],
				);
			});
		});

		runTx();
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		const runTx = this.db.transaction(() => {
			this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			this.db.run(
				"DELETE FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'",
				[sessionId, id],
			);
		});
		runTx();
	}

	// ─── Internal Persistent Operations ────────────────────────────────────────

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const saved = this.db
			.query(
				"SELECT * FROM saved_filters WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			)
			.get(id, scope.level, scopeId) as any;

		if (!saved) return null;

		const row = this.db
			.query(
				"SELECT * FROM filters WHERE filter_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			)
			.get(id, scope.level, scopeId) as any;

		if (!row) return null;

		const rulesRows = this.db
			.query(
				"SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC",
			)
			.all(id) as any[];

		const rules: FilterCondition[] = rulesRows.map((r) => ({
			property: r.property,
			operator: r.operator as any,
			value: JSON.parse(r.value),
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
			schema_snapshot: row.schema_snapshot || "{}",
		};
	}

	private async setPersistent(
		id: string,
		state: PersistedFilterState,
		scope: OwnerScope,
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const combinedIdsStr = state.combined_ids
			? JSON.stringify(state.combined_ids)
			: null;

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
					state.schema_snapshot,
				],
			);

			this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			state.rules.forEach((rule, idx) => {
				this.db.run(
					"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)",
					[id, rule.property, rule.operator, JSON.stringify(rule.value), idx],
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
				[
					id,
					JSON.stringify(state.tags),
					state.description,
					scope.level,
					scopeId,
				],
			);
		});

		runTx();
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		const runTx = this.db.transaction(() => {
			this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			this.db.run("DELETE FROM saved_filters WHERE id = ?", [id]);
			this.db.run(
				"DELETE FROM filters WHERE filter_id = ? AND scope_level = ?",
				[id, scope.level],
			);
		});
		runTx();
	}

	// ─── Additional Interface Methods ──────────────────────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const rows = this.db
			.query(
				"SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session'",
			)
			.all(sessionId) as any[];
		return rows.map((r) => r.filter_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = this.db
			.query(
				"SELECT filter_id FROM filters WHERE session_id = ? AND parent_filter_id = ? AND scope_level = 'session'",
			)
			.all(sessionId, parentId) as any[];
		return rows.map((r) => r.filter_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
			const rows = this.db
				.query(
					"SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session' AND created_at < ?",
				)
				.all(sessionId, olderThanDate) as any[];

			const runTx = this.db.transaction(() => {
				rows.forEach((r) => {
					this.db.run("DELETE FROM filter_rules WHERE filter_id = ?", [
						r.filter_id,
					]);
					this.db.run("DELETE FROM filters WHERE filter_id = ?", [r.filter_id]);
				});
			});
			runTx();
		} else {
			const runTx = this.db.transaction(() => {
				this.db.run(
					"DELETE FROM filter_rules WHERE filter_id IN (SELECT filter_id FROM filters WHERE session_id = ?)",
					[sessionId],
				);
				this.db.run(
					"DELETE FROM filters WHERE session_id = ? AND scope_level = 'session'",
					[sessionId],
				);
			});
			runTx();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const allSaved = this.db
			.query(
				"SELECT * FROM saved_filters WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			)
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
		includeGlobal?: boolean,
	): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_filters WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
				params.push(userId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_filters WHERE scope_level = 'user' AND user_id = ?";
				params.push(userId);
			}
		}

		const savedRecords = this.db.query(queryStr).all(...params) as any[];

		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
		for (const r of savedRecords) {
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

	private async getSession(
		sessionId: string,
		id: string,
	): Promise<FormState | null> {
		const row = this.db
			.query("SELECT * FROM forms WHERE form_id = ? AND session_id = ?")
			.get(id, sessionId) as any;
		if (!row) return null;
		return this.loadState(row);
	}

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails | null> {
		const row = this.db
			.query("SELECT * FROM forms WHERE form_id = ? AND scope_level = ?")
			.get(id, scope.level) as any;
		if (!row) return null;

		const saved = this.db
			.query("SELECT * FROM saved_forms WHERE id = ?")
			.get(id) as any;
		const tags = saved ? JSON.parse(saved.tags) : [];
		const description = saved ? saved.description : "";

		const state = await this.loadState(row);
		return {
			...state,
			tags,
			description,
			schema_pinned_at: row.created_at,
		};
	}

	private loadState(row: any): FormState {
		const formId = row.form_id;
		const answersRows = this.db
			.query("SELECT * FROM form_answers WHERE form_id = ?")
			.all(formId) as any[];
		const skippedRows = this.db
			.query("SELECT * FROM form_skipped WHERE form_id = ?")
			.all(formId) as any[];
		const staleRows = this.db
			.query("SELECT * FROM form_stale WHERE form_id = ?")
			.all(formId) as any[];

		const answers: Record<string, any> = {};
		for (const r of answersRows) {
			answers[r.question_id] = JSON.parse(r.value);
		}

		const skipped = skippedRows.map((r) => r.question_id);

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
		this.db.transaction(() => {
			this.db
				.query(`
        INSERT OR REPLACE INTO forms (form_id, parent_form_id, schema_name, scope_level, session_id, created_at)
        VALUES (?, ?, ?, 'session', ?, ?)
      `)
				.run(
					id,
					state.parentFormId,
					state.schemaName,
					sessionId,
					state.timestamp,
				);

			this.db.query("DELETE FROM form_answers WHERE form_id = ?").run(id);
			for (const [qId, val] of Object.entries(state.answers)) {
				this.db
					.query(
						"INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)",
					)
					.run(id, qId, JSON.stringify(val));
			}

			this.db.query("DELETE FROM form_skipped WHERE form_id = ?").run(id);
			for (const qId of state.skipped) {
				this.db
					.query(
						"INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)",
					)
					.run(id, qId);
			}

			this.db.query("DELETE FROM form_stale WHERE form_id = ?").run(id);
			for (const qId of Object.keys(state.stale)) {
				this.db
					.query("INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)")
					.run(id, qId);
			}
		})();
	}

	private async setPersistent(
		id: string,
		state: PersistedFormStateDetails,
		scope: OwnerScope,
	): Promise<void> {
		const userId = scope.level === "user" ? scope.userId : null;
		this.db.transaction(() => {
			this.db
				.query(`
        INSERT OR REPLACE INTO forms (form_id, parent_form_id, schema_name, scope_level, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
				.run(
					id,
					state.parentFormId,
					state.schemaName,
					scope.level,
					userId,
					state.timestamp,
				);

			this.db.query("DELETE FROM form_answers WHERE form_id = ?").run(id);
			for (const [qId, val] of Object.entries(state.answers)) {
				this.db
					.query(
						"INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)",
					)
					.run(id, qId, JSON.stringify(val));
			}

			this.db.query("DELETE FROM form_skipped WHERE form_id = ?").run(id);
			for (const qId of state.skipped) {
				this.db
					.query(
						"INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)",
					)
					.run(id, qId);
			}

			this.db.query("DELETE FROM form_stale WHERE form_id = ?").run(id);
			for (const qId of Object.keys(state.stale)) {
				this.db
					.query("INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)")
					.run(id, qId);
			}

			this.db
				.query(`
        INSERT OR REPLACE INTO saved_forms (id, tags, description, scope_level, user_id, saved_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
				.run(
					id,
					JSON.stringify(state.tags),
					state.description,
					scope.level,
					userId,
					state.timestamp,
				);
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
		const rows = this.db
			.query(
				"SELECT form_id FROM forms WHERE session_id = ? AND scope_level = 'session'",
			)
			.all(sessionId) as any[];
		return rows.map((r) => r.form_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = this.db
			.query(
				"SELECT form_id FROM forms WHERE session_id = ? AND parent_form_id = ?",
			)
			.all(sessionId, parentId) as any[];
		return rows.map((r) => r.form_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const now = Date.now();
			const cutoff = new Date(now - olderThanMs).toISOString();
			this.db
				.query("DELETE FROM forms WHERE session_id = ? AND created_at < ?")
				.run(sessionId, cutoff);
		} else {
			this.db.query("DELETE FROM forms WHERE session_id = ?").run(sessionId);
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
		const row = this.db
			.query(
				"SELECT target_id FROM form_session_aliases WHERE session_id = ? AND alias_name = ?",
			)
			.get(sessionId, alias) as any;
		return row ? row.target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.db
			.query(
				"INSERT OR REPLACE INTO form_session_aliases (session_id, alias_name, target_id) VALUES (?, ?, ?)",
			)
			.run(sessionId, alias, targetId);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.db
			.query(
				"DELETE FROM form_session_aliases WHERE session_id = ? AND alias_name = ?",
			)
			.run(sessionId, alias);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const rows = this.db
			.query(
				"SELECT alias_name, target_id FROM form_session_aliases WHERE session_id = ?",
			)
			.all(sessionId) as any[];
		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails[]> {
		const userId = scope.level === "user" ? scope.userId : null;
		const query =
			scope.level === "user"
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
				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
				params.push(userId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_forms WHERE scope_level = 'user' AND user_id = ?";
				params.push(userId);
			}
		}

		const savedRecords = this.db.query(queryStr).all(...params) as any[];
		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> =
			[];
		for (const r of savedRecords) {
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

export class SqliteConceptStore implements ConceptStore {
	private db: Database;

	constructor(dbPath: string) {
		const dir = path.dirname(dbPath);
		if (dir !== "." && !fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		this.db = new Database(dbPath);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS dict_namespaces (
        code TEXT PRIMARY KEY,
        description TEXT,
        is_public INTEGER NOT NULL,
        is_external_private INTEGER NOT NULL,
        is_mutable INTEGER
      )
    `);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS dict_concepts (
        id TEXT PRIMARY KEY,
        namespace_code TEXT NOT NULL,
        standard_code TEXT NOT NULL,
        display TEXT NOT NULL,
        description TEXT,
        designation_date TEXT,
        active INTEGER NOT NULL,
        FOREIGN KEY(namespace_code) REFERENCES dict_namespaces(code)
      )
    `);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS dict_relations (
        id TEXT PRIMARY KEY,
        concept_id TEXT NOT NULL,
        linked_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        active INTEGER NOT NULL,
        designation_date TEXT,
        FOREIGN KEY(concept_id) REFERENCES dict_concepts(id),
        FOREIGN KEY(linked_id) REFERENCES dict_concepts(id)
      )
    `);

		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_concept_rel_forward ON dict_relations(concept_id, active)`,
		);
		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_concept_rel_reverse ON dict_relations(linked_id, active)`,
		);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS dict_relation_cache (
        ancestor_concept_id TEXT NOT NULL,
        descendant_concept_id TEXT NOT NULL,
        link_depth INTEGER NOT NULL,
        inferred_relationship_type TEXT NOT NULL,
        active INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(ancestor_concept_id, descendant_concept_id, inferred_relationship_type)
      )
    `);

		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_concept_cache_traversal ON dict_relation_cache(ancestor_concept_id, active)`,
		);
	}

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		let sql =
			"SELECT * FROM dict_concepts WHERE (display LIKE ? OR id = ? OR standard_code = ? OR description LIKE ?)";
		const params: any[] = [`%${query}%`, query, query, `%${query}%`];

		if (namespaceCode) {
			sql += " AND namespace_code = ?";
			params.push(namespaceCode);
		}

		sql += " LIMIT ?";
		params.push(limit);

		const rows = this.db.query(sql).all(...params) as any[];
		return rows.map((r) => ({
			id: r.id,
			namespaceCode: r.namespace_code,
			standardCode: r.standard_code,
			display: r.display,
			description: r.description || undefined,
			designationDate: r.designation_date || undefined,
			active: r.active === 1,
		}));
	}

	async getById(id: string): Promise<Concept | null> {
		const r = this.db
			.query("SELECT * FROM dict_concepts WHERE id = ?")
			.get(id) as any;
		if (!r) return null;
		return {
			id: r.id,
			namespaceCode: r.namespace_code,
			standardCode: r.standard_code,
			display: r.display,
			description: r.description || undefined,
			designationDate: r.designation_date || undefined,
			active: r.active === 1,
		};
	}

	async listNamespaces(): Promise<Namespace[]> {
		const rows = this.db.query("SELECT * FROM dict_namespaces").all() as any[];
		return rows.map((r) => ({
			code: r.code,
			description: r.description || undefined,
			isPublic: r.is_public === 1,
			isExternalPrivate: r.is_external_private === 1,
			isMutable: r.is_mutable === 1,
		}));
	}

	async addConcept(concept: Concept): Promise<void> {
		this.db.run(
			`INSERT OR REPLACE INTO dict_concepts (id, namespace_code, standard_code, display, description, designation_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				concept.id,
				concept.namespaceCode,
				concept.standardCode,
				concept.display,
				concept.description || null,
				concept.designationDate || null,
				concept.active !== false ? 1 : 0,
			],
		);
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		this.db.run(
			`INSERT OR REPLACE INTO dict_namespaces (code, description, is_public, is_external_private, is_mutable)
       VALUES (?, ?, ?, ?, ?)`,
			[
				namespace.code,
				namespace.description || null,
				namespace.isPublic ? 1 : 0,
				namespace.isExternalPrivate ? 1 : 0,
				namespace.isMutable !== false ? 1 : 0,
			],
		);
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		this.db.run(
			`INSERT OR REPLACE INTO dict_relations (id, concept_id, linked_id, relationship_type, active, designation_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
			[
				relation.id,
				relation.conceptId,
				relation.linkedId,
				relation.relationshipType,
				relation.active !== false ? 1 : 0,
				relation.designationDate || null,
			],
		);
		await this.invalidateRelationCache(relation.conceptId);
		await this.invalidateRelationCache(relation.linkedId);
	}

	async invalidateRelationCache(conceptId?: string): Promise<void> {
		if (conceptId) {
			this.db.run(
				`DELETE FROM dict_relation_cache WHERE ancestor_concept_id = ? OR descendant_concept_id = ?`,
				[conceptId, conceptId],
			);
		} else {
			this.db.run(`DELETE FROM dict_relation_cache`);
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
				`SELECT id, concept_id, linked_id, relationship_type, active, designation_date FROM dict_relations WHERE concept_id = ? AND active = 1`,
			);
			params.push(conceptId);
		}

		if (direction === "reverse" || direction === "both") {
			sqlParts.push(
				`SELECT id, concept_id, linked_id, relationship_type, active, designation_date FROM dict_relations WHERE linked_id = ? AND active = 1`,
			);
			params.push(conceptId);
		}

		if (sqlParts.length === 0) return [];
		const rows = this.db
			.query(sqlParts.join(" UNION ALL "))
			.all(...params) as any[];

		return rows.map((r) => ({
			id: r.id,
			conceptId: r.concept_id,
			linkedId: r.linked_id,
			relationshipType: r.relationship_type,
			active: r.active === 1,
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
			const cached = this.db
				.query(
					`SELECT c.*, rc.link_depth, rc.inferred_relationship_type 
           FROM dict_relation_cache rc 
           JOIN dict_concepts c ON rc.descendant_concept_id = c.id 
           WHERE rc.ancestor_concept_id = ? AND rc.active = 1 AND rc.link_depth <= ?`,
				)
				.all(conceptId, maxDepth) as any[];

			if (cached.length > 0) {
				return cached.map((r) => ({
					concept: {
						id: r.id,
						namespaceCode: r.namespace_code,
						standardCode: r.standard_code,
						display: r.display,
						description: r.description || undefined,
						designationDate: r.designation_date || undefined,
						active: r.active === 1,
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
        WHERE concept_id = ? AND active = 1 AND (? = 'forward' OR ? = 'both')

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
        WHERE linked_id = ? AND active = 1 AND (? = 'reverse' OR ? = 'both')

        UNION ALL

        -- Recursive forward expansion
        SELECT r.linked_id, r.relationship_type, g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.concept_id
        WHERE r.active = 1 AND g.depth < ? AND g.dir = 'forward'

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
        WHERE r.active = 1 AND g.depth < ? AND g.dir = 'reverse'
      )
      SELECT DISTINCT g.target_id, g.relationship_type, g.dir, g.depth, c.* 
      FROM rel_graph g
      JOIN dict_concepts c ON g.target_id = c.id
      WHERE c.active = 1;
    `;

		const rows = this.db
			.query(cteSql)
			.all(
				conceptId,
				direction,
				direction,
				conceptId,
				direction,
				direction,
				maxDepth,
				maxDepth,
			) as any[];

		const results: RelatedConceptResult[] = rows.map((r) => ({
			concept: {
				id: r.id,
				namespaceCode: r.namespace_code,
				standardCode: r.standard_code,
				display: r.display,
				description: r.description || undefined,
				designationDate: r.designation_date || undefined,
				active: r.active === 1,
			},
			relationshipType: r.relationship_type,
			direction: r.dir,
			depth: r.depth,
		}));

		// Populate cache
		if (useCache && results.length > 0) {
			const now = new Date().toISOString();
			for (const res of results) {
				this.db.run(
					`INSERT OR REPLACE INTO dict_relation_cache (ancestor_concept_id, descendant_concept_id, link_depth, inferred_relationship_type, active, updated_at)
           VALUES (?, ?, ?, ?, 1, ?)`,
					[conceptId, res.concept.id, res.depth, res.relationshipType, now],
				);
			}
		}

		return results;
	}
}

export class SqlitePersistentExpressionStore
	implements PersistentExpressionStore
{
	private db: Database;

	constructor(dbPath: string) {
		const dir = path.dirname(dbPath);
		if (dir !== "." && !fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		this.db = new Database(dbPath);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS dict_custom_expressions (
        id TEXT PRIMARY KEY,
        term TEXT NOT NULL,
        concept_id TEXT,
        scope_level TEXT NOT NULL,
        scope_id TEXT,
        data TEXT NOT NULL
      )
    `);
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		this.db.run(
			`INSERT OR REPLACE INTO dict_custom_expressions (id, term, concept_id, scope_level, scope_id, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
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
		this.db.run(
			"DELETE FROM dict_custom_expressions WHERE id = ? AND scope_level = ? AND (scope_id = ? OR scope_id IS NULL)",
			[id, scope.level, scopeId],
		);
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		let sql =
			"SELECT * FROM dict_custom_expressions WHERE (scope_level = ? AND (scope_id = ? OR scope_id IS NULL))";
		const params: any[] = [scope.level, scopeId];

		if (includeGlobal && scope.level !== "global") {
			sql += " OR scope_level = 'global'";
		}

		const rows = this.db.query(sql).all(...params) as any[];
		return rows.map((r) => JSON.parse(r.data));
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const row = this.db
			.query("SELECT data FROM dict_custom_expressions WHERE id = ?")
			.get(id) as any;
		return row ? JSON.parse(row.data) : null;
	}
}

// Register SQLite repo adapter
registerAdapter("sqlite", {
	create: async (options) => {
		const dbPath = String(options.path || "./sqlite.db");
		return new SqliteFilterStore(dbPath);
	},
});
