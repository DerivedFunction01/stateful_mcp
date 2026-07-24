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
import * as S from "./sqlite-schema";

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
		this.db.run(S.PRAGMA_WAL);
		this.db.run(S.DDL_FILTERS);
		this.db.run(S.DDL_FILTER_RULES);
		this.db.run(S.DDL_SAVED_FILTERS);
		this.db.run(S.DDL_SESSION_ALIASES);
		this.db.run(S.IDX_FILTERS_SESSION);
		this.db.run(S.IDX_FILTERS_SCOPE);
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
		const row = this.db.query(S.SQL_GET_ALIAS).get(sessionId, alias) as any;
		return row ? row.target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.db.run(S.SQL_UPSERT_ALIAS, [sessionId, alias, targetId]);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.db.run(S.SQL_DELETE_ALIAS, [sessionId, alias]);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const rows = this.db.query(S.SQL_LIST_ALIASES).all(sessionId) as any[];
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
			.query(S.SQL_SELECT_FILTER_SESSION)
			.get(sessionId, id) as any;

		if (!row) return null;

		const rulesRows = this.db.query(S.SQL_SELECT_FILTER_RULES).all(id) as any[];

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
			this.db.run(S.SQL_UPSERT_FILTER, [
				id,
				state.toolName || null,
				state.tableName || null,
				state.parentFilterId || null,
				"session",
				sessionId,
				null,
				state.combined_operation || null,
				combinedIdsStr,
				schemaSnapshotStr,
			]);

			this.db.run(S.SQL_DELETE_FILTER_RULES, [id]);
			state.rules.forEach((rule, idx) => {
				this.db.run(S.SQL_INSERT_FILTER_RULE, [
					id,
					rule.property,
					rule.operator,
					JSON.stringify(rule.value),
					idx,
				]);
			});
		});

		runTx();
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		const runTx = this.db.transaction(() => {
			this.db.run(S.SQL_DELETE_FILTER_RULES, [id]);
			this.db.run(S.SQL_DELETE_FILTER_SESSION, [sessionId, id]);
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
			.query(S.SQL_SELECT_SAVED_FILTER)
			.get(id, scope.level, scopeId) as any;

		if (!saved) return null;

		const row = this.db
			.query(S.SQL_SELECT_FILTER_PERSISTENT)
			.get(id, scope.level, scopeId) as any;

		if (!row) return null;

		const rulesRows = this.db.query(S.SQL_SELECT_FILTER_RULES).all(id) as any[];

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
			schema_snapshot: row.schema_snapshot
				? JSON.parse(row.schema_snapshot)
				: "{}",
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
			this.db.run(S.SQL_UPSERT_FILTER, [
				id,
				state.toolName || null,
				state.tableName || null,
				state.parentFilterId || null,
				scope.level,
				null,
				scopeId,
				state.combined_operation || null,
				combinedIdsStr,
				state.schema_snapshot,
			]);

			this.db.run(S.SQL_DELETE_FILTER_RULES, [id]);
			state.rules.forEach((rule, idx) => {
				this.db.run(S.SQL_INSERT_FILTER_RULE, [
					id,
					rule.property,
					rule.operator,
					JSON.stringify(rule.value),
					idx,
				]);
			});

			this.db.run(S.SQL_UPSERT_SAVED_FILTER, [
				id,
				JSON.stringify(state.tags),
				state.description,
				scope.level,
				scopeId,
			]);
		});

		runTx();
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		const runTx = this.db.transaction(() => {
			this.db.run(S.SQL_DELETE_FILTER_RULES, [id]);
			this.db.run(S.SQL_DELETE_SAVED_FILTER, [id]);
			this.db.run(S.SQL_DELETE_FILTER_PERSISTENT, [id, scope.level]);
		});
		runTx();
	}

	// ─── Additional Interface Methods ──────────────────────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_FILTERS_SESSION)
			.all(sessionId) as any[];
		return rows.map((r) => r.filter_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_FILTERS_CHILDREN)
			.all(sessionId, parentId) as any[];
		return rows.map((r) => r.filter_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
			const rows = this.db
				.query(S.SQL_EXPIRE_FILTERS_SESSION_FIND)
				.all(sessionId, olderThanDate) as any[];

			const runTx = this.db.transaction(() => {
				rows.forEach((r) => {
					this.db.run(S.SQL_DELETE_FILTER_RULES, [r.filter_id]);
					this.db.run(S.SQL_DELETE_FILTER_BY_ID, [r.filter_id]);
				});
			});
			runTx();
		} else {
			const runTx = this.db.transaction(() => {
				this.db.run(S.SQL_DELETE_FILTER_RULES_BY_SESSION, [sessionId]);
				this.db.run(S.SQL_DELETE_FILTERS_BY_SESSION, [sessionId]);
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
			.query(S.SQL_SELECT_SAVED_FILTERS_BY_SCOPE)
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
		this.db.run(S.PRAGMA_WAL);
		this.db.run(S.DDL_FORMS);
		this.db.run(S.DDL_FORM_ANSWERS);
		this.db.run(S.DDL_FORM_SKIPPED);
		this.db.run(S.DDL_FORM_STALE);
		this.db.run(S.DDL_SAVED_FORMS);
		this.db.run(S.DDL_FORM_SESSION_ALIASES);
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
			.query(S.SQL_SELECT_FORM_SESSION)
			.get(id, sessionId) as any;
		if (!row) return null;
		return this.loadState(row);
	}

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails | null> {
		const row = this.db
			.query(S.SQL_SELECT_FORM_PERSISTENT)
			.get(id, scope.level) as any;
		if (!row) return null;

		const saved = this.db.query(S.SQL_SELECT_SAVED_FORM).get(id) as any;
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
			.query(S.SQL_SELECT_FORM_ANSWERS)
			.all(formId) as any[];
		const skippedRows = this.db
			.query(S.SQL_SELECT_FORM_SKIPPED)
			.all(formId) as any[];
		const staleRows = this.db
			.query(S.SQL_SELECT_FORM_STALE)
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
				.query(S.SQL_UPSERT_FORM_SESSION)
				.run(
					id,
					state.parentFormId,
					state.schemaName,
					sessionId,
					state.timestamp,
				);

			this.db.query(S.SQL_DELETE_FORM_ANSWERS).run(id);
			for (const [qId, val] of Object.entries(state.answers)) {
				this.db
					.query(S.SQL_INSERT_FORM_ANSWER)
					.run(id, qId, JSON.stringify(val));
			}

			this.db.query(S.SQL_DELETE_FORM_SKIPPED).run(id);
			for (const qId of state.skipped) {
				this.db.query(S.SQL_INSERT_FORM_SKIPPED).run(id, qId);
			}

			this.db.query(S.SQL_DELETE_FORM_STALE).run(id);
			for (const qId of Object.keys(state.stale)) {
				this.db.query(S.SQL_INSERT_FORM_STALE).run(id, qId);
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
				.query(S.SQL_UPSERT_FORM_PERSISTENT)
				.run(
					id,
					state.parentFormId,
					state.schemaName,
					scope.level,
					userId,
					state.timestamp,
				);

			this.db.query(S.SQL_DELETE_FORM_ANSWERS).run(id);
			for (const [qId, val] of Object.entries(state.answers)) {
				this.db
					.query(S.SQL_INSERT_FORM_ANSWER)
					.run(id, qId, JSON.stringify(val));
			}

			this.db.query(S.SQL_DELETE_FORM_SKIPPED).run(id);
			for (const qId of state.skipped) {
				this.db.query(S.SQL_INSERT_FORM_SKIPPED).run(id, qId);
			}

			this.db.query(S.SQL_DELETE_FORM_STALE).run(id);
			for (const qId of Object.keys(state.stale)) {
				this.db.query(S.SQL_INSERT_FORM_STALE).run(id, qId);
			}

			this.db
				.query(S.SQL_UPSERT_SAVED_FORM)
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
		this.db.query(S.SQL_DELETE_FORM_ANSWERS).run(a);
		this.db.query(S.SQL_DELETE_FORM_SKIPPED).run(a);
		this.db.query(S.SQL_DELETE_FORM_STALE).run(a);
		this.db.query(S.SQL_DELETE_FORM).run(a);
		this.db.query(S.SQL_DELETE_SAVED_FORM).run(a);
	}

	async listSession(sessionId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_FORMS_SESSION)
			.all(sessionId) as any[];
		return rows.map((r) => r.form_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_FORMS_CHILDREN)
			.all(sessionId, parentId) as any[];
		return rows.map((r) => r.form_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const now = Date.now();
			const cutoff = new Date(now - olderThanMs).toISOString();
			this.db.query(S.SQL_EXPIRE_FORMS_BY_SESSION_AGE).run(sessionId, cutoff);
		} else {
			this.db.query(S.SQL_EXPIRE_FORMS_BY_SESSION).run(sessionId);
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
			.query(S.SQL_GET_FORM_ALIAS)
			.get(sessionId, alias) as any;
		return row ? row.target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.db.query(S.SQL_UPSERT_FORM_ALIAS).run(sessionId, alias, targetId);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.db.query(S.SQL_DELETE_FORM_ALIAS).run(sessionId, alias);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const rows = this.db.query(S.SQL_LIST_FORM_ALIASES).all(sessionId) as any[];
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

		this.db.run(S.DDL_DICT_NAMESPACES);
		this.db.run(S.DDL_DICT_CONCEPTS);
		this.db.run(S.DDL_DICT_RELATIONS);
		this.db.run(S.IDX_CONCEPT_REL_FORWARD);
		this.db.run(S.IDX_CONCEPT_REL_REVERSE);
		this.db.run(S.DDL_DICT_RELATION_CACHE);
		this.db.run(S.IDX_CONCEPT_CACHE_TRAVERSAL);
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
		const r = this.db.query(S.SQL_SELECT_DICT_CONCEPT_BY_ID).get(id) as any;
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
		const rows = this.db.query(S.SQL_SELECT_DICT_NAMESPACES).all() as any[];
		return rows.map((r) => ({
			code: r.code,
			description: r.description || undefined,
			isPublic: r.is_public === 1,
			isExternalPrivate: r.is_external_private === 1,
			isMutable: r.is_mutable === 1,
		}));
	}

	async addConcept(concept: Concept): Promise<void> {
		this.db.run(S.SQL_UPSERT_DICT_CONCEPT, [
			concept.id,
			concept.namespaceCode,
			concept.standardCode,
			concept.display,
			concept.description || null,
			concept.designationDate || null,
			concept.active !== false ? 1 : 0,
		]);
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		this.db.run(S.SQL_UPSERT_DICT_NAMESPACE, [
			namespace.code,
			namespace.description || null,
			namespace.isPublic ? 1 : 0,
			namespace.isExternalPrivate ? 1 : 0,
			namespace.isMutable !== false ? 1 : 0,
		]);
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		this.db.run(S.SQL_UPSERT_DICT_RELATION, [
			relation.id,
			relation.conceptId,
			relation.linkedId,
			relation.relationshipType,
			relation.active !== false ? 1 : 0,
			relation.designationDate || null,
		]);
		await this.invalidateRelationCache(relation.conceptId);
		await this.invalidateRelationCache(relation.linkedId);
	}

	async invalidateRelationCache(conceptId?: string): Promise<void> {
		if (conceptId) {
			this.db.run(S.SQL_DELETE_DICT_RELATION_CACHE_FOR, [conceptId, conceptId]);
		} else {
			this.db.run(S.SQL_DELETE_DICT_RELATION_CACHE);
		}
	}

	async getRelations(
		conceptId: string,
		direction: TraversalDirection = "both",
	): Promise<ConceptRelation[]> {
		const sqlParts: string[] = [];
		const params: any[] = [];

		if (direction === "forward" || direction === "both") {
			sqlParts.push(S.SQL_SELECT_DICT_RELATIONS_FORWARD);
			params.push(conceptId);
		}

		if (direction === "reverse" || direction === "both") {
			sqlParts.push(S.SQL_SELECT_DICT_RELATIONS_REVERSE);
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
				.query(S.SQL_SELECT_DICT_CACHE_RELATED)
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
		const rows = this.db
			.query(S.CTE_DICT_RELATED_CONCEPTS)
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
				this.db.run(S.SQL_UPSERT_DICT_RELATION_CACHE, [
					conceptId,
					res.concept.id,
					res.depth,
					res.relationshipType,
					now,
				]);
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

		this.db.run(S.DDL_DICT_CUSTOM_EXPRESSIONS);
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		this.db.run(S.SQL_UPSERT_DICT_EXPRESSION, [
			expression.id,
			expression.term,
			expression.conceptId || null,
			scope.level,
			scopeId,
			JSON.stringify(expression),
		]);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		this.db.run(S.SQL_DELETE_DICT_EXPRESSION, [id, scope.level, scopeId]);
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
		const row = this.db.query(S.SQL_SELECT_DICT_EXPRESSION_DATA).get(id) as any;
		return row ? JSON.parse(row.data) : null;
	}
}

// ── SQLite Object Store ──────────────────────────────────────────────

export class SqliteObjectStore
	implements SessionObjectStore, PersistentObjectStore
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
		this.db.run(S.PRAGMA_WAL);
		this.db.run(S.DDL_OBJECTS);
		this.db.run(S.DDL_SAVED_OBJECTS);
		this.db.run(S.DDL_OBJECT_SESSION_ALIASES);
	}

	// ─── Overloaded get ────────────────────────────────────────────────

	get(sessionId: string, id: string): Promise<ObjectState | null>;
	get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		} else {
			return this.getPersistent(a, b);
		}
	}

	// ─── Overloaded set ────────────────────────────────────────────────

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

	// ─── Overloaded delete ─────────────────────────────────────────────

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
			.query(S.SQL_GET_OBJECT_ALIAS)
			.get(sessionId, alias) as any;
		return row ? row.target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.db.run(S.SQL_UPSERT_OBJECT_ALIAS, [sessionId, alias, targetId]);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.db.run(S.SQL_DELETE_OBJECT_ALIAS, [sessionId, alias]);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const rows = this.db
			.query(S.SQL_LIST_OBJECT_ALIASES)
			.all(sessionId) as any[];
		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
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

	// ─── Internal Session Operations ───────────────────────────────────

	private async getSession(
		sessionId: string,
		id: string,
	): Promise<ObjectState | null> {
		const row = this.db
			.query(S.SQL_SELECT_OBJECT_SESSION)
			.get(sessionId, id) as any;

		if (!row) return null;
		return this.loadState(row);
	}

	private async setSession(
		sessionId: string,
		id: string,
		state: ObjectState,
	): Promise<void> {
		const dataStr = JSON.stringify(state.data);
		const schemaPinnedAt = state.schema_pinned_at || null;

		this.db.run(S.SQL_UPSERT_OBJECT_SESSION, [
			id,
			state.schemaName,
			state.parentObjectId || null,
			sessionId,
			dataStr,
			state.createdAt,
			schemaPinnedAt,
		]);
	}

	private async deleteSession(sessionId: string, id: string): Promise<void> {
		this.db.run(S.SQL_DELETE_OBJECT_SESSION, [sessionId, id]);
	}

	private loadState(row: any): ObjectState {
		return {
			objectId: row.object_id,
			schemaName: row.schema_name,
			parentObjectId: row.parent_object_id,
			data: JSON.parse(row.data),
			createdAt: row.created_at,
			schema_pinned_at: row.schema_pinned_at || undefined,
			linearDepth: row.linear_depth || undefined,
			gcLock: row.gc_lock === 1,
		};
	}

	// ─── Internal Persistent Operations ────────────────────────────────

	private async getPersistent(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const saved = this.db
			.query(S.SQL_SELECT_SAVED_OBJECT)
			.get(id, scope.level, scopeId) as any;

		if (!saved) return null;

		const row = this.db
			.query(S.SQL_SELECT_OBJECT_PERSISTENT)
			.get(id, scope.level, scopeId) as any;

		if (!row) return null;

		return {
			...this.loadState(row),
			tags: JSON.parse(saved.tags),
			description: saved.description,
			schema_pinned_at: row.schema_pinned_at || "",
		};
	}

	private async setPersistent(
		id: string,
		state: PersistedObjectState,
		scope: OwnerScope,
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const dataStr = JSON.stringify(state.data);
		const schemaPinnedAt = state.schema_pinned_at || "";

		this.db.run(S.SQL_UPSERT_OBJECT_PERSISTENT, [
			id,
			state.schemaName,
			state.parentObjectId || null,
			scope.level,
			scopeId,
			dataStr,
			state.createdAt,
			schemaPinnedAt,
		]);

		this.db.run(S.SQL_UPSERT_SAVED_OBJECT, [
			id,
			JSON.stringify(state.tags),
			state.description,
			scope.level,
			scopeId,
		]);
	}

	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
		this.db.run(S.SQL_DELETE_SAVED_OBJECT, [id]);
		this.db.run(S.SQL_DELETE_OBJECT_PERSISTENT, [id, scope.level]);
	}

	// ─── Additional Interface Methods ──────────────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_OBJECTS_SESSION)
			.all(sessionId) as any[];
		return rows.map((r) => r.object_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_OBJECTS_CHILDREN)
			.all(sessionId, parentId) as any[];
		return rows.map((r) => r.object_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
			this.db
				.query(S.SQL_EXPIRE_OBJECTS_SESSION_AGE)
				.run(sessionId, olderThanDate);
		} else {
			this.db.run(S.SQL_EXPIRE_OBJECTS_SESSION, [sessionId]);
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const allSaved = this.db
			.query(S.SQL_SELECT_SAVED_OBJECTS_BY_SCOPE)
			.all(scope.level, scopeId) as any[];

		const results: PersistedObjectState[] = [];
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
	): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_objects WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
				params.push(userId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_objects WHERE scope_level = 'user' AND user_id = ?";
				params.push(userId);
			}
		}

		const savedRecords = this.db.query(queryStr).all(...params) as any[];

		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
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

// ── SQLite Event Store ────────────────────────────────────────────────

export class SqliteEventStore
	implements SessionEventStore, PersistentEventStore
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
		this.db.run(S.PRAGMA_WAL);
		this.db.run(S.DDL_EVENTS);
		this.db.run(S.DDL_SAVED_EVENTS);
		this.db.run(S.DDL_EVENT_SESSION_ALIASES);
	}

	// ─── Overloaded get ────────────────────────────────────────────────

	get(sessionId: string, commitId: string): Promise<EventCommit | null>;
	get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			return this.getSession(a, b);
		} else {
			return this.getPersistent(a, b);
		}
	}

	// ─── Overloaded set ────────────────────────────────────────────────

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

	// ─── Overloaded delete ─────────────────────────────────────────────

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
		const row = this.db
			.query(S.SQL_GET_EVENT_ALIAS)
			.get(sessionId, alias) as any;
		return row ? row.target_id : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.db.run(S.SQL_UPSERT_EVENT_ALIAS, [sessionId, alias, targetId]);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.db.run(S.SQL_DELETE_EVENT_ALIAS, [sessionId, alias]);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const rows = this.db
			.query(S.SQL_LIST_EVENT_ALIASES)
			.all(sessionId) as any[];
		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
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

	// ─── Internal Session Operations ───────────────────────────────────

	private async getSession(
		sessionId: string,
		commitId: string,
	): Promise<EventCommit | null> {
		const row = this.db
			.query(S.SQL_SELECT_EVENT_SESSION)
			.get(sessionId, commitId) as any;

		if (!row) return null;
		return this.loadState(row);
	}

	private async setSession(
		sessionId: string,
		commitId: string,
		state: EventCommit,
	): Promise<void> {
		const mutationsStr = JSON.stringify(state.mutations);
		const mergeSourceIds = state.mergeSourceCommitIds
			? JSON.stringify(state.mergeSourceCommitIds)
			: null;
		const mergeAcceptedIds = state.mergeAcceptedIds
			? JSON.stringify(state.mergeAcceptedIds)
			: null;
		const mergeRejectedIds = state.mergeRejectedIds
			? JSON.stringify(state.mergeRejectedIds)
			: null;

		this.db.run(S.SQL_UPSERT_EVENT_SESSION, [
			commitId,
			sessionId,
			state.parentCommitId || null,
			state.operation,
			mutationsStr,
			state.createdAt,
			state.linearDepth || 0,
			state.gcLock ? 1 : 0,
			mergeSourceIds,
			mergeAcceptedIds,
			mergeRejectedIds,
		]);
	}

	private async deleteSession(
		sessionId: string,
		commitId: string,
	): Promise<void> {
		this.db.run(S.SQL_DELETE_EVENT_SESSION, [sessionId, commitId]);
	}

	private loadState(row: any): EventCommit {
		return {
			commitId: row.commit_id,
			sessionId: row.session_id,
			parentCommitId: row.parent_commit_id,
			createdAt: row.created_at,
			operation: row.operation,
			mutations: JSON.parse(row.mutations),
			linearDepth: row.linear_depth || 0,
			gcLock: row.gc_lock === 1,
			mergeSourceCommitIds: row.merge_source_commit_ids
				? JSON.parse(row.merge_source_commit_ids)
				: undefined,
			mergeAcceptedIds: row.merge_accepted_ids
				? JSON.parse(row.merge_accepted_ids)
				: undefined,
			mergeRejectedIds: row.merge_rejected_ids
				? JSON.parse(row.merge_rejected_ids)
				: undefined,
		};
	}

	// ─── Internal Persistent Operations ────────────────────────────────

	private async getPersistent(
		commitId: string,
		scope: OwnerScope,
	): Promise<PersistedEventState | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;

		const saved = this.db
			.query(S.SQL_SELECT_SAVED_EVENT)
			.get(commitId, scope.level, scopeId) as any;

		if (!saved) return null;

		const row = this.db
			.query(S.SQL_SELECT_EVENT_PERSISTENT)
			.get(commitId, scope.level, scopeId) as any;

		if (!row) return null;

		return {
			...this.loadState(row),
			tags: JSON.parse(saved.tags),
			description: saved.description,
			schema_name: row.schema_name,
		};
	}

	private async setPersistent(
		commitId: string,
		state: PersistedEventState,
		scope: OwnerScope,
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const mutationsStr = JSON.stringify(state.mutations);
		const mergeSourceIds = state.mergeSourceCommitIds
			? JSON.stringify(state.mergeSourceCommitIds)
			: null;
		const mergeAcceptedIds = state.mergeAcceptedIds
			? JSON.stringify(state.mergeAcceptedIds)
			: null;
		const mergeRejectedIds = state.mergeRejectedIds
			? JSON.stringify(state.mergeRejectedIds)
			: null;

		this.db.run(S.SQL_UPSERT_EVENT_PERSISTENT, [
			commitId,
			scope.level,
			scopeId,
			state.parentCommitId || null,
			state.operation,
			mutationsStr,
			state.createdAt,
			state.linearDepth || 0,
			state.gcLock ? 1 : 0,
			mergeSourceIds,
			mergeAcceptedIds,
			mergeRejectedIds,
			state.schema_name,
		]);

		this.db.run(S.SQL_UPSERT_SAVED_EVENT, [
			commitId,
			JSON.stringify(state.tags),
			state.description,
			scope.level,
			scopeId,
		]);
	}

	private async deletePersistent(
		commitId: string,
		scope: OwnerScope,
	): Promise<void> {
		this.db.run(S.SQL_DELETE_SAVED_EVENT, [commitId]);
		this.db.run(S.SQL_DELETE_EVENT_PERSISTENT, [commitId, scope.level]);
	}

	// ─── Additional Interface Methods ──────────────────────────────────

	async listSession(sessionId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_EVENTS_SESSION)
			.all(sessionId) as any[];
		return rows.map((r) => r.commit_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = this.db
			.query(S.SQL_LIST_EVENTS_CHILDREN)
			.all(sessionId, parentId) as any[];
		return rows.map((r) => r.commit_id);
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
			this.db
				.query(S.SQL_EXPIRE_EVENTS_SESSION_AGE)
				.run(sessionId, olderThanDate);
		} else {
			this.db.run(S.SQL_EXPIRE_EVENTS_SESSION, [sessionId]);
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedEventState[]> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const allSaved = this.db
			.query(S.SQL_SELECT_SAVED_EVENTS_BY_SCOPE)
			.all(scope.level, scopeId) as any[];

		const results: PersistedEventState[] = [];
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
	): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
		const userId = scope.level === "user" ? scope.userId : null;
		let queryStr =
			"SELECT id, scope_level, user_id FROM saved_events WHERE (scope_level = 'global')";
		const params: any[] = [];
		if (scope.level === "user") {
			if (includeGlobal) {
				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
				params.push(userId);
			} else {
				queryStr =
					"SELECT id, scope_level, user_id FROM saved_events WHERE scope_level = 'user' AND user_id = ?";
				params.push(userId);
			}
		}

		const savedRecords = this.db.query(queryStr).all(...params) as any[];

		const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
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

// Register SQLite repo adapter
registerAdapter("sqlite", {
	create: async (options) => {
		const dbPath = String(options.path || "./sqlite.db");
		return {
			sessionFilter: new SqliteFilterStore(dbPath),
			persistentFilter: new SqliteFilterStore(dbPath),
			sessionObject: new SqliteObjectStore(dbPath),
			persistentObject: new SqliteObjectStore(dbPath),
			sessionEvent: new SqliteEventStore(dbPath),
			persistentEvent: new SqliteEventStore(dbPath),
			sessionForm: new SqliteFormStore(dbPath),
			persistentForm: new SqliteFormStore(dbPath),
			conceptStore: new SqliteConceptStore(dbPath),
			persistentExpressionStore: new SqlitePersistentExpressionStore(dbPath),
		};
	},
});
