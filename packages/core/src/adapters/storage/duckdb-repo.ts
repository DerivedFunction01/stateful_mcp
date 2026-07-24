import * as crypto from "crypto";
import { registerAdapter } from "../../config/loader";
import type { OwnerScope } from "../../config/types";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../../middleware/dictionary/interfaces";
import type {
	Concept,
	ConceptRelation,
	ConceptRelationType,
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
import { DuckDBInstance } from "@duckdb/node-api";

async function getConnection(dbPath: string): Promise<import("@duckdb/node-api").DuckDBConnection> {
	const instance = await DuckDBInstance.create(dbPath, { allow_unsigned_extensions: "true" });
	return await instance.connect();
}

// ── DuckDB Filter Store ──────────────────────────────────────────

export class DuckDbFilterStore
	implements SessionFilterStore, PersistentFilterStore
{
	private conn!: import("@duckdb/node-api").DuckDBConnection;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		this.conn = await getConnection(this.dbPath);

		await this.conn.run(`
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
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS filter_rules (
        id           INTEGER PRIMARY KEY,
        filter_id    TEXT NOT NULL,
        property     TEXT NOT NULL,
        operator     TEXT NOT NULL,
        value        TEXT NOT NULL,
        index_order  INTEGER NOT NULL,
        UNIQUE(filter_id, index_order),
        FOREIGN KEY(filter_id) REFERENCES filters(filter_id) ON DELETE CASCADE
      )
    `);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS saved_filters (
        id           TEXT PRIMARY KEY,
        tags         TEXT NOT NULL,
        description  TEXT NOT NULL,
        scope_level  TEXT NOT NULL,
        user_id      TEXT NULL,
        saved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS session_aliases (
        session_id  TEXT NOT NULL,
        alias_name  TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        PRIMARY KEY (session_id, alias_name)
      )
    `);

		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_filters_session ON filters(session_id, scope_level)");
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_filters_scope ON filters(scope_level, user_id)");
	}

	get(sessionId: string, id: string): Promise<FilterState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		}
		return this.getPersistent(a, b);
	}

	set(sessionId: string, id: string, state: FilterState): Promise<void>;
	set(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.setPersistent(a, b, c);
		}
		return this.setSession(a, b, c);
	}

	delete(sessionId: string, id: string): Promise<void>;
	delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		if (typeof b === "string") {
			return this.deleteSession(a, b);
		}
		return this.deletePersistent(a, b);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
		const rows = reader.getRowObjectsJS();
		return rows.length > 0 ? String(rows[0]!.target_id) : null;
	}

	async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		await this.conn.run(
			`INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.conn.run(
			"DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
	}

	async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
		const reader = await this.conn.runAndReadAll(
			"SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => ({ alias: String(r.alias_name), targetId: String(r.target_id) }));
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

	private async getSession(sessionId: string, id: string): Promise<FilterState | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'",
			[sessionId, id],
		);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		const row = rows[0]!;

		const rulesReader = await this.conn.runAndReadAll(
			"SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC",
			[id],
		);
		const rulesRows = rulesReader.getRowObjectsJS();
		const rules: FilterCondition[] = rulesRows.map((r) => ({
			property: String(r.property),
			operator: r.operator as any,
			value: JSON.parse(String(r.value)),
		}));

		return {
			filterId: String(row.filter_id),
			toolName: row.tool_name ? String(row.tool_name) : undefined,
			tableName: row.table_name ? String(row.table_name) : undefined,
			rules,
			parentFilterId: row.parent_filter_id ? String(row.parent_filter_id) : null,
			createdAt: String(row.created_at),
			combined_operation: row.combined_operation as any,
			combined_ids: row.combined_ids ? JSON.parse(String(row.combined_ids)) : null,
			schema_snapshot: row.schema_snapshot ? JSON.parse(String(row.schema_snapshot)) : null,
		};
	}

	private async setSession(sessionId: string, id: string, state: FilterState): Promise<void> {
		const combinedIdsStr = state.combined_ids ? JSON.stringify(state.combined_ids) : null;
		const schemaSnapshotStr = state.schema_snapshot ? JSON.stringify(state.schema_snapshot) : null;

		await this.conn.run("BEGIN");
		try {
			await this.conn.run(
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

			await this.conn.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			for (let i = 0; i < state.rules.length; i++) {
				const rule = state.rules[i]!;
				await this.conn.run(
					"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)",
					[id, rule.property, rule.operator, JSON.stringify(rule.value), i],
				);
			}
			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		await this.conn.run("BEGIN");
		try {
			await this.conn.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			await this.conn.run(
				"DELETE FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'",
				[sessionId, id],
			);
			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	private async getPersistent(id: string, scope: OwnerScope): Promise<PersistedFilterState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const savedReader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_filters WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const savedRows = savedReader.getRowObjectsJS();
		if (savedRows.length === 0) return null;
		const saved = savedRows[0]!;

		const filterReader = await this.conn.runAndReadAll(
			"SELECT * FROM filters WHERE filter_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const filterRows = filterReader.getRowObjectsJS();
		if (filterRows.length === 0) return null;
		const row = filterRows[0]!;

		const rulesReader = await this.conn.runAndReadAll(
			"SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC",
			[id],
		);
		const rulesRows = rulesReader.getRowObjectsJS();
		const rules: FilterCondition[] = rulesRows.map((r) => ({
			property: String(r.property),
			operator: r.operator as any,
			value: JSON.parse(String(r.value)),
		}));

		return {
			filterId: String(row.filter_id),
			toolName: row.tool_name ? String(row.tool_name) : undefined,
			tableName: row.table_name ? String(row.table_name) : undefined,
			rules,
			parentFilterId: row.parent_filter_id ? String(row.parent_filter_id) : null,
			createdAt: String(row.created_at),
			combined_operation: row.combined_operation as any,
			combined_ids: row.combined_ids ? JSON.parse(String(row.combined_ids)) : null,
			tags: JSON.parse(String(saved.tags)),
			description: String(saved.description),
			schema_snapshot: row.schema_snapshot ? JSON.parse(String(row.schema_snapshot)) : "{}",
		};
	}

	private async setPersistent(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const combinedIdsStr = state.combined_ids ? JSON.stringify(state.combined_ids) : null;

		await this.conn.run("BEGIN");
		try {
			await this.conn.run(
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

			await this.conn.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			for (let i = 0; i < state.rules.length; i++) {
				const rule = state.rules[i]!;
				await this.conn.run(
					"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)",
					[id, rule.property, rule.operator, JSON.stringify(rule.value), i],
				);
			}

			await this.conn.run(
				`INSERT INTO saved_filters (id, tags, description, scope_level, user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tags=excluded.tags,
           description=excluded.description,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id`,
				[id, JSON.stringify(state.tags), state.description, scope.level, scopeId],
			);

			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		await this.conn.run("BEGIN");
		try {
			await this.conn.run("DELETE FROM filter_rules WHERE filter_id = ?", [id]);
			await this.conn.run("DELETE FROM saved_filters WHERE id = ?", [id]);
			await this.conn.run(
				"DELETE FROM filters WHERE filter_id = ? AND scope_level = ?",
				[id, scope.level],
			);
			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	async findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_filters WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[scope.level, scopeId],
		);
		const rows = reader.getRowObjectsJS();
		const results: PersistedFilterState[] = [];
		for (const saved of rows) {
			const tags: string[] = JSON.parse(String(saved.tags));
			if (tags.includes(tag)) {
				const full = await this.getPersistent(String(saved.id), scope);
				if (full) results.push(full);
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
				queryStr += " OR (scope_level = ? AND user_id = ?)";
				params.push(scope.level, userId);
			} else {
				queryStr = "SELECT id, scope_level, user_id FROM saved_filters WHERE scope_level = ? AND user_id = ?";
				params.push(scope.level, userId);
			}
		}

		const reader = await this.conn.runAndReadAll(queryStr, params);
		const savedRecords = reader.getRowObjectsJS();
		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
		for (const r of savedRecords) {
			const recordScope: OwnerScope = r.scope_level === "user"
				? { level: "user", userId: String(r.user_id) }
				: { level: "global" };
			const state = await this.getPersistent(String(r.id), recordScope);
			if (state) {
				results.push({ ...state, scope: recordScope });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session'",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.filter_id));
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT filter_id FROM filters WHERE session_id = ? AND parent_filter_id = ? AND scope_level = 'session'",
			[sessionId, parentId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.filter_id));
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
			await this.conn.run(
				"DELETE FROM filters WHERE session_id = ? AND created_at < ? AND scope_level = 'session'",
				[sessionId, cutoff],
			);
		} else {
			await this.conn.run("DELETE FROM filters WHERE session_id = ? AND scope_level = 'session'", [sessionId]);
		}
	}
}

// ── DuckDB Form Store ────────────────────────────────────────────

export class DuckDbFormStore implements SessionFormStore, PersistentFormStore {
	private conn!: import("@duckdb/node-api").DuckDBConnection;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		this.conn = await getConnection(this.dbPath);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS forms (
        form_id         TEXT PRIMARY KEY,
        parent_form_id  TEXT NULL,
        schema_name     TEXT NOT NULL,
        scope_level     TEXT NOT NULL DEFAULT 'session',
        session_id      TEXT NULL,
        user_id         TEXT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS form_answers (
        form_id     TEXT NOT NULL,
        question_id TEXT NOT NULL,
        value       TEXT NOT NULL,
        PRIMARY KEY (form_id, question_id),
        FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS form_skipped (
        form_id     TEXT NOT NULL,
        question_id TEXT NOT NULL,
        PRIMARY KEY (form_id, question_id),
        FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS form_stale (
        form_id     TEXT NOT NULL,
        question_id TEXT NOT NULL,
        PRIMARY KEY (form_id, question_id),
        FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS saved_forms (
        id           TEXT PRIMARY KEY,
        tags         TEXT NOT NULL,
        description  TEXT NOT NULL,
        scope_level  TEXT NOT NULL,
        user_id      TEXT NULL,
        saved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_forms_session ON forms(session_id, scope_level)");
	}

	get(sessionId: string, id: string): Promise<FormState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedFormStateDetails | null>;
	async get(a: string, b: any): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		}
		return this.getPersistent(a, b);
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

	async delete(sessionId: string, id: string): Promise<void>;
	async delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b?: any): Promise<void> {
		await this.conn.run("DELETE FROM form_answers WHERE form_id = ?", [a]);
		await this.conn.run("DELETE FROM form_skipped WHERE form_id = ?", [a]);
		await this.conn.run("DELETE FROM form_stale WHERE form_id = ?", [a]);
		await this.conn.run("DELETE FROM forms WHERE form_id = ?", [a]);
		await this.conn.run("DELETE FROM saved_forms WHERE id = ?", [a]);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
		const rows = reader.getRowObjectsJS();
		return rows.length > 0 ? String(rows[0]!.target_id) : null;
	}

	async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		await this.conn.run(
			`INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.conn.run(
			"DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
	}

	async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
		const reader = await this.conn.runAndReadAll(
			"SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => ({ alias: String(r.alias_name), targetId: String(r.target_id) }));
	}

	async create(
		sessionId: string,
		state: Omit<FormState, "formId"> & { formId?: string },
		alias?: string,
	): Promise<string> {
		const id = `form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: FormState = { ...state, formId: id };
		await this.setSession(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	private async getSession(sessionId: string, id: string): Promise<FormState | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM forms WHERE form_id = ? AND session_id = ?",
			[id, sessionId],
		);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		return this.loadState(rows[0]!);
	}

	private async getPersistent(id: string, scope: OwnerScope): Promise<PersistedFormStateDetails | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM forms WHERE form_id = ? AND scope_level = ?",
			[id, scope.level],
		);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		const formRow = rows[0]!;

		const savedReader = await this.conn.runAndReadAll("SELECT * FROM saved_forms WHERE id = ?", [id]);
		const savedRows = savedReader.getRowObjectsJS();
		const saved = savedRows[0];
		const tags = saved ? JSON.parse(String(saved.tags)) : [];
		const description = saved ? String(saved.description) : "";

		const state = await this.loadState(formRow);
		return {
			...state,
			tags,
			description,
			schema_pinned_at: String(formRow.created_at),
		};
	}

	private async loadState(row: Record<string, any>): Promise<FormState> {
		const formId = String(row.form_id);

		const answersReader = await this.conn.runAndReadAll(
			"SELECT * FROM form_answers WHERE form_id = ?",
			[formId],
		);
		const answersRows = answersReader.getRowObjectsJS();
		const answers: Record<string, any> = {};
		for (const a of answersRows) {
			answers[String(a.question_id)] = JSON.parse(String(a.value));
		}

		const skippedReader = await this.conn.runAndReadAll(
			"SELECT question_id FROM form_skipped WHERE form_id = ?",
			[formId],
		);
		const skipped = skippedReader.getRowObjectsJS().map((r) => String(r.question_id));

		const staleReader = await this.conn.runAndReadAll(
			"SELECT question_id FROM form_stale WHERE form_id = ?",
			[formId],
		);
		const staleRows = staleReader.getRowObjectsJS();
		const stale: Record<string, boolean> = {};
		for (const s of staleRows) {
			stale[String(s.question_id)] = true;
		}

		return {
			formId,
			parentFormId: row.parent_form_id ? String(row.parent_form_id) : null,
			schemaName: String(row.schema_name),
			answers,
			skipped,
			stale,
			timestamp: String(row.created_at),
		};
	}

	private async setSession(sessionId: string, id: string, state: FormState): Promise<void> {
		await this.conn.run("BEGIN");
		try {
			await this.conn.run(
				`INSERT INTO forms (form_id, parent_form_id, schema_name, scope_level, session_id, created_at)
         VALUES (?, ?, ?, 'session', ?, ?)
         ON CONFLICT(form_id) DO UPDATE SET
           parent_form_id=excluded.parent_form_id,
           schema_name=excluded.schema_name,
           scope_level=excluded.scope_level,
           session_id=excluded.session_id,
           created_at=excluded.created_at`,
				[id, state.parentFormId, state.schemaName, sessionId, state.timestamp],
			);

			await this.conn.run("DELETE FROM form_answers WHERE form_id = ?", [id]);
			for (const [qId, val] of Object.entries(state.answers)) {
				await this.conn.run(
					"INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)",
					[id, qId, JSON.stringify(val)],
				);
			}

			await this.conn.run("DELETE FROM form_skipped WHERE form_id = ?", [id]);
			for (const qId of state.skipped) {
				await this.conn.run(
					"INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)",
					[id, qId],
				);
			}

			await this.conn.run("DELETE FROM form_stale WHERE form_id = ?", [id]);
			for (const qId of Object.keys(state.stale)) {
				await this.conn.run(
					"INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)",
					[id, qId],
				);
			}

			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	private async setPersistent(id: string, state: PersistedFormStateDetails, scope: OwnerScope): Promise<void> {
		const userId = scope.level === "user" ? scope.userId : null;
		await this.conn.run("BEGIN");
		try {
			await this.conn.run(
				`INSERT INTO forms (form_id, parent_form_id, schema_name, scope_level, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(form_id) DO UPDATE SET
           parent_form_id=excluded.parent_form_id,
           schema_name=excluded.schema_name,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id,
           created_at=excluded.created_at`,
				[id, state.parentFormId, state.schemaName, scope.level, userId, state.timestamp],
			);

			await this.conn.run("DELETE FROM form_answers WHERE form_id = ?", [id]);
			for (const [qId, val] of Object.entries(state.answers)) {
				await this.conn.run(
					"INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)",
					[id, qId, JSON.stringify(val)],
				);
			}

			await this.conn.run("DELETE FROM form_skipped WHERE form_id = ?", [id]);
			for (const qId of state.skipped) {
				await this.conn.run(
					"INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)",
					[id, qId],
				);
			}

			await this.conn.run("DELETE FROM form_stale WHERE form_id = ?", [id]);
			for (const qId of Object.keys(state.stale)) {
				await this.conn.run(
					"INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)",
					[id, qId],
				);
			}

			await this.conn.run(
				`INSERT INTO saved_forms (id, tags, description, scope_level, user_id, saved_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tags=excluded.tags,
           description=excluded.description,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id,
           saved_at=excluded.saved_at`,
				[id, JSON.stringify(state.tags), state.description, scope.level, userId, state.timestamp],
			);

			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	async findByTag(tag: string, scope: OwnerScope): Promise<PersistedFormStateDetails[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_forms WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[scope.level, scopeId],
		);
		const rows = reader.getRowObjectsJS();
		const results: PersistedFormStateDetails[] = [];
		for (const saved of rows) {
			const tags: string[] = JSON.parse(String(saved.tags));
			if (tags.includes(tag)) {
				const full = await this.getPersistent(String(saved.id), scope);
				if (full) results.push(full);
			}
		}
		return results;
	}

	async list(scope: OwnerScope, includeGlobal?: boolean): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr = "SELECT id, scope_level, user_id FROM saved_forms WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = ? AND user_id = ?)";
				params.push(scope.level, userId);
			} else {
				queryStr = "SELECT id, scope_level, user_id FROM saved_forms WHERE scope_level = ? AND user_id = ?";
				params.push(scope.level, userId);
			}
		}

		const reader = await this.conn.runAndReadAll(queryStr, params);
		const savedRecords = reader.getRowObjectsJS();
		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> = [];
		for (const r of savedRecords) {
			const recordScope: OwnerScope = r.scope_level === "user"
				? { level: "user", userId: String(r.user_id) }
				: { level: "global" };
			const state = await this.getPersistent(String(r.id), recordScope);
			if (state) {
				results.push({ ...state, scope: recordScope });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT form_id FROM forms WHERE session_id = ? AND scope_level = 'session'",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.form_id));
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT form_id FROM forms WHERE session_id = ? AND parent_form_id = ?",
			[sessionId, parentId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.form_id));
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
			await this.conn.run(
				"DELETE FROM forms WHERE session_id = ? AND created_at < ?",
				[sessionId, cutoff],
			);
		} else {
			await this.conn.run("DELETE FROM forms WHERE session_id = ?", [sessionId]);
		}
	}
}

// ── DuckDB Concept Store ─────────────────────────────────────────

export class DuckDbConceptStore implements ConceptStore {
	private conn!: import("@duckdb/node-api").DuckDBConnection;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		this.conn = await getConnection(this.dbPath);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS dict_namespaces (
        code TEXT PRIMARY KEY,
        description TEXT,
        is_public BOOLEAN NOT NULL,
        is_external_private BOOLEAN NOT NULL,
        is_mutable BOOLEAN
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS dict_concepts (
        id TEXT PRIMARY KEY,
        namespace_code TEXT NOT NULL,
        standard_code TEXT NOT NULL,
        display TEXT NOT NULL,
        description TEXT,
        designation_date TIMESTAMP,
        active BOOLEAN NOT NULL,
        FOREIGN KEY(namespace_code) REFERENCES dict_namespaces(code)
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS dict_relations (
        id TEXT PRIMARY KEY,
        concept_id TEXT NOT NULL,
        linked_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        active BOOLEAN NOT NULL,
        designation_date TIMESTAMP,
        FOREIGN KEY(concept_id) REFERENCES dict_concepts(id),
        FOREIGN KEY(linked_id) REFERENCES dict_concepts(id)
      )
    `);
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_dict_rel_forward ON dict_relations(concept_id, active)");
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_dict_rel_reverse ON dict_relations(linked_id, active)");
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS dict_relation_cache (
        ancestor_concept_id TEXT NOT NULL,
        descendant_concept_id TEXT NOT NULL,
        link_depth INTEGER NOT NULL,
        inferred_relationship_type TEXT NOT NULL,
        active BOOLEAN NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        PRIMARY KEY(ancestor_concept_id, descendant_concept_id, inferred_relationship_type)
      )
    `);
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_dict_cache_traversal ON dict_relation_cache(ancestor_concept_id, active)");
	}

	async search(query: string, namespaceCode?: string, limit: number = 50): Promise<Concept[]> {
		let sql = "SELECT * FROM dict_concepts WHERE (display ILIKE ? OR id = ? OR standard_code = ? OR description ILIKE ?)";
		const params: any[] = [`%${query}%`, query, query, `%${query}%`];
		if (namespaceCode) {
			sql += " AND namespace_code = ?";
			params.push(namespaceCode);
		}
		sql += " LIMIT ?";
		params.push(limit);

		const reader = await this.conn.runAndReadAll(sql, params);
		const rows = reader.getRowObjectsJS();
		return rows.map((r: any) => ({
			id: String(r.id),
			namespaceCode: String(r.namespace_code),
			standardCode: String(r.standard_code),
			display: String(r.display),
			description: r.description ? String(r.description) : undefined,
			designationDate: r.designation_date ? String(r.designation_date) : undefined,
			active: Boolean(r.active),
		}));
	}

	async getById(id: string): Promise<Concept | null> {
		const reader = await this.conn.runAndReadAll("SELECT * FROM dict_concepts WHERE id = ?", [id]);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		const r = rows[0]!;
		return {
			id: String(r.id),
			namespaceCode: String(r.namespace_code),
			standardCode: String(r.standard_code),
			display: String(r.display),
			description: r.description ? String(r.description) : undefined,
			designationDate: r.designation_date ? String(r.designation_date) : undefined,
			active: Boolean(r.active),
		};
	}

	async listNamespaces(): Promise<Namespace[]> {
		const reader = await this.conn.runAndReadAll("SELECT * FROM dict_namespaces");
		const rows = reader.getRowObjectsJS();
		return rows.map((r: any) => ({
			code: String(r.code),
			description: r.description ? String(r.description) : undefined,
			isPublic: Boolean(r.is_public),
			isExternalPrivate: Boolean(r.is_external_private),
			isMutable: r.is_mutable !== undefined ? Boolean(r.is_mutable) : undefined,
		}));
	}

	async addConcept(concept: Concept): Promise<void> {
		await this.conn.run(
			`INSERT INTO dict_concepts (id, namespace_code, standard_code, display, description, designation_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         namespace_code=excluded.namespace_code,
         standard_code=excluded.standard_code,
         display=excluded.display,
         description=excluded.description,
         designation_date=excluded.designation_date,
         active=excluded.active`,
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
		await this.conn.run(
			`INSERT INTO dict_namespaces (code, description, is_public, is_external_private, is_mutable)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         description=excluded.description,
         is_public=excluded.is_public,
         is_external_private=excluded.is_external_private,
         is_mutable=excluded.is_mutable`,
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
		await this.conn.run(
			`INSERT INTO dict_relations (id, concept_id, linked_id, relationship_type, active, designation_date)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         concept_id=excluded.concept_id,
         linked_id=excluded.linked_id,
         relationship_type=excluded.relationship_type,
         active=excluded.active,
         designation_date=excluded.designation_date`,
			[
				relation.id,
				relation.conceptId,
				relation.linkedId,
				relation.relationshipType,
				relation.active !== false,
				relation.designationDate || null,
			],
		);
	}
}

// ── DuckDB Persistent Expression Store ───────────────────────────

export class DuckDbPersistentExpressionStore implements PersistentExpressionStore {
	private conn!: import("@duckdb/node-api").DuckDBConnection;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		this.conn = await getConnection(this.dbPath);

		await this.conn.run(`
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
		await this.conn.run(
			`INSERT INTO dict_custom_expressions (id, term, concept_id, scope_level, scope_id, data)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         term=excluded.term,
         concept_id=excluded.concept_id,
         scope_level=excluded.scope_level,
         scope_id=excluded.scope_id,
         data=excluded.data`,
			[expression.id, expression.term, expression.conceptId || null, scope.level, scopeId, JSON.stringify(expression)],
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		await this.conn.run(
			"DELETE FROM dict_custom_expressions WHERE id = ? AND scope_level = ? AND (scope_id = ? OR scope_id IS NULL)",
			[id, scope.level, scopeId],
		);
	}

	async list(scope: OwnerScope, includeGlobal?: boolean): Promise<CustomExpression[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		let sql = "SELECT data FROM dict_custom_expressions WHERE (scope_level = ? AND (scope_id = ? OR scope_id IS NULL))";
		const params: any[] = [scope.level, scopeId];
		if (includeGlobal && scope.level !== "global") {
			sql += " OR scope_level = 'global'";
		}
		const reader = await this.conn.runAndReadAll(sql, params);
		const rows = reader.getRowObjectsJS();
		return rows.map((r: any) => JSON.parse(String(r.data)));
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const reader = await this.conn.runAndReadAll("SELECT data FROM dict_custom_expressions WHERE id = ?", [id]);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		return JSON.parse(String(rows[0]!.data));
	}
}

// ── DuckDB Object Store ──────────────────────────────────────────

export class DuckDbObjectStore
	implements SessionObjectStore, PersistentObjectStore
{
	private conn!: import("@duckdb/node-api").DuckDBConnection;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		this.conn = await getConnection(this.dbPath);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS objects (
        object_id        TEXT PRIMARY KEY,
        schema_name      TEXT NOT NULL,
        parent_object_id TEXT NULL,
        scope_level      TEXT NOT NULL DEFAULT 'session',
        session_id       TEXT NULL,
        user_id          TEXT NULL,
        data             TEXT NOT NULL,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        schema_pinned_at TEXT NULL,
        linear_depth     INTEGER DEFAULT 0,
        gc_lock          BOOLEAN DEFAULT 0
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS saved_objects (
        id           TEXT PRIMARY KEY,
        tags         TEXT NOT NULL,
        description  TEXT NOT NULL,
        scope_level  TEXT NOT NULL,
        user_id      TEXT NULL,
        saved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_objects_session ON objects(session_id, scope_level)");
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_objects_scope ON objects(scope_level, user_id)");
	}

	get(sessionId: string, id: string): Promise<ObjectState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		}
		return this.getPersistent(a, b);
	}

	set(sessionId: string, id: string, state: ObjectState): Promise<void>;
	set(id: string, state: PersistedObjectState, scope: OwnerScope): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.setPersistent(a, b, c);
		}
		return this.setSession(a, b, c);
	}

	delete(sessionId: string, id: string): Promise<void>;
	delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		if (typeof b === "string") {
			return this.deleteSession(a, b);
		}
		return this.deletePersistent(a, b);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
		const rows = reader.getRowObjectsJS();
		return rows.length > 0 ? String(rows[0]!.target_id) : null;
	}

	async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		await this.conn.run(
			`INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.conn.run(
			"DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
	}

	async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
		const reader = await this.conn.runAndReadAll(
			"SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => ({ alias: String(r.alias_name), targetId: String(r.target_id) }));
	}

	async create(
		sessionId: string,
		state: Omit<ObjectState, "objectId"> & { objectId?: string },
		alias?: string,
	): Promise<string> {
		const id = `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: ObjectState = { ...state, objectId: id };
		await this.setSession(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	private async getSession(sessionId: string, id: string): Promise<ObjectState | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM objects WHERE session_id = ? AND object_id = ? AND scope_level = 'session'",
			[sessionId, id],
		);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		return this.loadState(rows[0]!);
	}

	private loadState(row: Record<string, any>): ObjectState {
		return {
			objectId: String(row.object_id),
			schemaName: String(row.schema_name),
			parentObjectId: row.parent_object_id ? String(row.parent_object_id) : null,
			data: JSON.parse(String(row.data)),
			createdAt: String(row.created_at),
			schema_pinned_at: row.schema_pinned_at ? String(row.schema_pinned_at) : undefined,
			linearDepth: row.linear_depth ? Number(row.linear_depth) : undefined,
			gcLock: Boolean(row.gc_lock),
		};
	}

	private async setSession(sessionId: string, id: string, state: ObjectState): Promise<void> {
		const dataStr = JSON.stringify(state.data);
		await this.conn.run(
			`INSERT INTO objects (object_id, schema_name, parent_object_id, scope_level, session_id, data, created_at, schema_pinned_at)
       VALUES (?, ?, ?, 'session', ?, ?, ?, ?)
       ON CONFLICT(object_id) DO UPDATE SET
         schema_name=excluded.schema_name,
         parent_object_id=excluded.parent_object_id,
         scope_level=excluded.scope_level,
         session_id=excluded.session_id,
         data=excluded.data,
         created_at=excluded.created_at,
         schema_pinned_at=excluded.schema_pinned_at`,
			[id, state.schemaName, state.parentObjectId || null, sessionId, dataStr, state.createdAt, state.schema_pinned_at || null],
		);
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		await this.conn.run(
			"DELETE FROM objects WHERE session_id = ? AND object_id = ? AND scope_level = 'session'",
			[sessionId, id],
		);
	}

	private async getPersistent(id: string, scope: OwnerScope): Promise<PersistedObjectState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const savedReader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_objects WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const savedRows = savedReader.getRowObjectsJS();
		if (savedRows.length === 0) return null;
		const saved = savedRows[0]!;

		const objReader = await this.conn.runAndReadAll(
			"SELECT * FROM objects WHERE object_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[id, scope.level, scopeId],
		);
		const objRows = objReader.getRowObjectsJS();
		if (objRows.length === 0) return null;
		const row = objRows[0]!;

		return {
			...this.loadState(row),
			tags: JSON.parse(String(saved.tags)),
			description: String(saved.description),
			schema_pinned_at: row.schema_pinned_at ? String(row.schema_pinned_at) : "",
		};
	}

	private async setPersistent(id: string, state: PersistedObjectState, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const dataStr = JSON.stringify(state.data);

		await this.conn.run("BEGIN");
		try {
			await this.conn.run(
				`INSERT INTO objects (object_id, schema_name, parent_object_id, scope_level, user_id, data, created_at, schema_pinned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(object_id) DO UPDATE SET
           schema_name=excluded.schema_name,
           parent_object_id=excluded.parent_object_id,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id,
           data=excluded.data,
           created_at=excluded.created_at,
           schema_pinned_at=excluded.schema_pinned_at`,
				[id, state.schemaName, state.parentObjectId || null, scope.level, scopeId, dataStr, state.createdAt, state.schema_pinned_at || null],
			);

			await this.conn.run(
				`INSERT INTO saved_objects (id, tags, description, scope_level, user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tags=excluded.tags,
           description=excluded.description,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id`,
				[id, JSON.stringify(state.tags), state.description, scope.level, scopeId],
			);

			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		await this.conn.run("DELETE FROM saved_objects WHERE id = ?", [id]);
		await this.conn.run("DELETE FROM objects WHERE object_id = ? AND scope_level = ?", [id, scope.level]);
	}

	async findByTag(tag: string, scope: OwnerScope): Promise<PersistedObjectState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_objects WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[scope.level, scopeId],
		);
		const rows = reader.getRowObjectsJS();
		const results: PersistedObjectState[] = [];
		for (const saved of rows) {
			const tags: string[] = JSON.parse(String(saved.tags));
			if (tags.includes(tag)) {
				const full = await this.getPersistent(String(saved.id), scope);
				if (full) results.push(full);
			}
		}
		return results;
	}

	async list(scope: OwnerScope, includeGlobal?: boolean): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr = "SELECT id, scope_level, user_id FROM saved_objects WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = ? AND user_id = ?)";
				params.push(scope.level, userId);
			} else {
				queryStr = "SELECT id, scope_level, user_id FROM saved_objects WHERE scope_level = ? AND user_id = ?";
				params.push(scope.level, userId);
			}
		}

		const reader = await this.conn.runAndReadAll(queryStr, params);
		const savedRecords = reader.getRowObjectsJS();
		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
		for (const r of savedRecords) {
			const recordScope: OwnerScope = r.scope_level === "user"
				? { level: "user", userId: String(r.user_id) }
				: { level: "global" };
			const state = await this.getPersistent(String(r.id), recordScope);
			if (state) {
				results.push({ ...state, scope: recordScope });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT object_id FROM objects WHERE session_id = ? AND scope_level = 'session'",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.object_id));
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT object_id FROM objects WHERE session_id = ? AND parent_object_id = ? AND scope_level = 'session'",
			[sessionId, parentId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.object_id));
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
			await this.conn.run(
				"DELETE FROM objects WHERE session_id = ? AND created_at < ? AND scope_level = 'session'",
				[sessionId, cutoff],
			);
		} else {
			await this.conn.run("DELETE FROM objects WHERE session_id = ? AND scope_level = 'session'", [sessionId]);
		}
	}
}

// ── DuckDB Event Store ───────────────────────────────────────────

export class DuckDbEventStore
	implements SessionEventStore, PersistentEventStore
{
	private conn!: import("@duckdb/node-api").DuckDBConnection;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.initSchema();
	}

	private async initSchema(): Promise<void> {
		this.conn = await getConnection(this.dbPath);

		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS events (
        commit_id              TEXT PRIMARY KEY,
        session_id             TEXT NULL,
        parent_commit_id       TEXT NULL,
        scope_level            TEXT NOT NULL DEFAULT 'session',
        user_id                TEXT NULL,
        operation              TEXT NOT NULL,
        mutations              TEXT NOT NULL,
        created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        linear_depth           INTEGER DEFAULT 0,
        gc_lock                BOOLEAN DEFAULT 0,
        merge_source_commit_ids TEXT NULL,
        merge_accepted_ids     TEXT NULL,
        merge_rejected_ids     TEXT NULL,
        schema_name            TEXT NULL
      )
    `);
		await this.conn.run(`
      CREATE TABLE IF NOT EXISTS saved_events (
        id           TEXT PRIMARY KEY,
        tags         TEXT NOT NULL,
        description  TEXT NOT NULL,
        scope_level  TEXT NOT NULL,
        user_id      TEXT NULL,
        saved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, scope_level)");
		await this.conn.run("CREATE INDEX IF NOT EXISTS idx_events_scope ON events(scope_level, user_id)");
	}

	get(sessionId: string, commitId: string): Promise<EventCommit | null>;
	get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		}
		return this.getPersistent(a, b);
	}

	set(sessionId: string, commitId: string, state: EventCommit): Promise<void>;
	set(commitId: string, state: PersistedEventState, scope: OwnerScope): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.setPersistent(a, b, c);
		}
		return this.setSession(a, b, c);
	}

	delete(sessionId: string, commitId: string): Promise<void>;
	delete(commitId: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		if (typeof b === "string") {
			return this.deleteSession(a, b);
		}
		return this.deletePersistent(a, b);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
		const rows = reader.getRowObjectsJS();
		return rows.length > 0 ? String(rows[0]!.target_id) : null;
	}

	async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		await this.conn.run(
			`INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`,
			[sessionId, alias, targetId],
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.conn.run(
			"DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?",
			[sessionId, alias],
		);
	}

	async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
		const reader = await this.conn.runAndReadAll(
			"SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => ({ alias: String(r.alias_name), targetId: String(r.target_id) }));
	}

	async create(
		sessionId: string,
		state: Omit<EventCommit, "commitId"> & { commitId?: string },
		alias?: string,
	): Promise<string> {
		const id = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: EventCommit = { ...state, commitId: id };
		await this.setSession(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	private async getSession(sessionId: string, commitId: string): Promise<EventCommit | null> {
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM events WHERE session_id = ? AND commit_id = ? AND scope_level = 'session'",
			[sessionId, commitId],
		);
		const rows = reader.getRowObjectsJS();
		if (rows.length === 0) return null;
		const row = rows[0]!;
		return this.loadState(row);
	}

	private loadState(row: Record<string, any>): EventCommit {
		return {
			commitId: String(row.commit_id),
			sessionId: String(row.session_id),
			parentCommitId: row.parent_commit_id ? String(row.parent_commit_id) : null,
			createdAt: String(row.created_at),
			operation: row.operation as "add" | "update" | "remove" | "merge",
			mutations: JSON.parse(String(row.mutations)),
			linearDepth: row.linear_depth ? Number(row.linear_depth) : 0,
			gcLock: Boolean(row.gc_lock),
			mergeSourceCommitIds: row.merge_source_commit_ids ? JSON.parse(String(row.merge_source_commit_ids)) : undefined,
			mergeAcceptedIds: row.merge_accepted_ids ? JSON.parse(String(row.merge_accepted_ids)) : undefined,
			mergeRejectedIds: row.merge_rejected_ids ? JSON.parse(String(row.merge_rejected_ids)) : undefined,
		};
	}

	private async setSession(sessionId: string, commitId: string, state: EventCommit): Promise<void> {
		const mutationsStr = JSON.stringify(state.mutations);
		const mergeSourceIds = state.mergeSourceCommitIds ? JSON.stringify(state.mergeSourceCommitIds) : null;
		const mergeAcceptedIds = state.mergeAcceptedIds ? JSON.stringify(state.mergeAcceptedIds) : null;
		const mergeRejectedIds = state.mergeRejectedIds ? JSON.stringify(state.mergeRejectedIds) : null;

		await this.conn.run(
			`INSERT INTO events (commit_id, session_id, parent_commit_id, scope_level, operation, mutations, created_at, linear_depth, gc_lock, merge_source_commit_ids, merge_accepted_ids, merge_rejected_ids)
       VALUES (?, ?, ?, 'session', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(commit_id) DO UPDATE SET
         session_id=excluded.session_id,
         parent_commit_id=excluded.parent_commit_id,
         scope_level=excluded.scope_level,
         operation=excluded.operation,
         mutations=excluded.mutations,
         created_at=excluded.created_at,
         linear_depth=excluded.linear_depth,
         gc_lock=excluded.gc_lock,
         merge_source_commit_ids=excluded.merge_source_commit_ids,
         merge_accepted_ids=excluded.merge_accepted_ids,
         merge_rejected_ids=excluded.merge_rejected_ids`,
			[
				commitId,
				sessionId,
				state.parentCommitId,
				state.operation,
				mutationsStr,
				state.createdAt,
				state.linearDepth,
				state.gcLock,
				mergeSourceIds,
				mergeAcceptedIds,
				mergeRejectedIds,
			],
		);
	}

	private async deleteSession(sessionId: string, commitId: string): Promise<void> {
		await this.conn.run(
			"DELETE FROM events WHERE session_id = ? AND commit_id = ? AND scope_level = 'session'",
			[sessionId, commitId],
		);
	}

	private async getPersistent(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const savedReader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_events WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[commitId, scope.level, scopeId],
		);
		const savedRows = savedReader.getRowObjectsJS();
		if (savedRows.length === 0) return null;
		const saved = savedRows[0]!;

		const eventReader = await this.conn.runAndReadAll(
			"SELECT * FROM events WHERE commit_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[commitId, scope.level, scopeId],
		);
		const eventRows = eventReader.getRowObjectsJS();
		if (eventRows.length === 0) return null;
		const row = eventRows[0]!;

		return {
			...this.loadState(row),
			tags: JSON.parse(String(saved.tags)),
			description: String(saved.description),
			schema_name: String(row.schema_name),
		};
	}

	private async setPersistent(commitId: string, state: PersistedEventState, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const mutationsStr = JSON.stringify(state.mutations);
		const mergeSourceIds = state.mergeSourceCommitIds ? JSON.stringify(state.mergeSourceCommitIds) : null;
		const mergeAcceptedIds = state.mergeAcceptedIds ? JSON.stringify(state.mergeAcceptedIds) : null;
		const mergeRejectedIds = state.mergeRejectedIds ? JSON.stringify(state.mergeRejectedIds) : null;

		await this.conn.run("BEGIN");
		try {
			await this.conn.run(
				`INSERT INTO events (commit_id, scope_level, user_id, parent_commit_id, operation, mutations, created_at, linear_depth, gc_lock, merge_source_commit_ids, merge_accepted_ids, merge_rejected_ids, schema_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(commit_id) DO UPDATE SET
           scope_level=excluded.scope_level,
           user_id=excluded.user_id,
           parent_commit_id=excluded.parent_commit_id,
           operation=excluded.operation,
           mutations=excluded.mutations,
           created_at=excluded.created_at,
           linear_depth=excluded.linear_depth,
           gc_lock=excluded.gc_lock,
           merge_source_commit_ids=excluded.merge_source_commit_ids,
           merge_accepted_ids=excluded.merge_accepted_ids,
           merge_rejected_ids=excluded.merge_rejected_ids,
           schema_name=excluded.schema_name`,
				[
					commitId,
					scope.level,
					scopeId,
					state.parentCommitId,
					state.operation,
					mutationsStr,
					state.createdAt,
					state.linearDepth,
					state.gcLock,
					mergeSourceIds,
					mergeAcceptedIds,
					mergeRejectedIds,
					state.schema_name,
				],
			);

			await this.conn.run(
				`INSERT INTO saved_events (id, tags, description, scope_level, user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tags=excluded.tags,
           description=excluded.description,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id`,
				[commitId, JSON.stringify(state.tags), state.description, scope.level, scopeId],
			);

			await this.conn.run("COMMIT");
		} catch (err) {
			await this.conn.run("ROLLBACK");
			throw err;
		}
	}

	private async deletePersistent(commitId: string, scope: OwnerScope): Promise<void> {
		await this.conn.run("DELETE FROM saved_events WHERE id = ?", [commitId]);
		await this.conn.run("DELETE FROM events WHERE commit_id = ? AND scope_level = ?", [commitId, scope.level]);
	}

	async findByTag(tag: string, scope: OwnerScope): Promise<PersistedEventState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const reader = await this.conn.runAndReadAll(
			"SELECT * FROM saved_events WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)",
			[scope.level, scopeId],
		);
		const rows = reader.getRowObjectsJS();
		const results: PersistedEventState[] = [];
		for (const saved of rows) {
			const tags: string[] = JSON.parse(String(saved.tags));
			if (tags.includes(tag)) {
				const full = await this.getPersistent(String(saved.id), scope);
				if (full) results.push(full);
			}
		}
		return results;
	}

	async list(scope: OwnerScope, includeGlobal?: boolean): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr = "SELECT id, scope_level, user_id FROM saved_events WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = ? AND user_id = ?)";
				params.push(scope.level, userId);
			} else {
				queryStr = "SELECT id, scope_level, user_id FROM saved_events WHERE scope_level = ? AND user_id = ?";
				params.push(scope.level, userId);
			}
		}

		const reader = await this.conn.runAndReadAll(queryStr, params);
		const savedRecords = reader.getRowObjectsJS();
		const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
		for (const r of savedRecords) {
			const recordScope: OwnerScope = r.scope_level === "user"
				? { level: "user", userId: String(r.user_id) }
				: { level: "global" };
			const state = await this.getPersistent(String(r.id), recordScope);
			if (state) {
				results.push({ ...state, scope: recordScope });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT commit_id FROM events WHERE session_id = ? AND scope_level = 'session'",
			[sessionId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.commit_id));
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const reader = await this.conn.runAndReadAll(
			"SELECT commit_id FROM events WHERE session_id = ? AND parent_commit_id = ? AND scope_level = 'session'",
			[sessionId, parentId],
		);
		const rows = reader.getRowObjectsJS();
		return rows.map((r) => String(r.commit_id));
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
			await this.conn.run(
				"DELETE FROM events WHERE session_id = ? AND created_at < ? AND scope_level = 'session'",
				[sessionId, cutoff],
			);
		} else {
			await this.conn.run("DELETE FROM events WHERE session_id = ? AND scope_level = 'session'", [sessionId]);
		}
	}
}

// ── Registry Registration ────────────────────────────────────────

registerAdapter("duckdb", {
	create: async (options) => {
		const dbPath = String(options.path || "./duckdb.db");
		return {
			sessionFilter: new DuckDbFilterStore(dbPath),
			persistentFilter: new DuckDbFilterStore(dbPath),
			sessionObject: new DuckDbObjectStore(dbPath),
			persistentObject: new DuckDbObjectStore(dbPath),
			sessionEvent: new DuckDbEventStore(dbPath),
			persistentEvent: new DuckDbEventStore(dbPath),
			sessionForm: new DuckDbFormStore(dbPath),
			persistentForm: new DuckDbFormStore(dbPath),
			conceptStore: new DuckDbConceptStore(dbPath),
			persistentExpressionStore: new DuckDbPersistentExpressionStore(dbPath),
		};
	},
});