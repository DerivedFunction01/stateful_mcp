// import { DuckDBInstance } from "@duckdb/node-api";
// import * as crypto from "crypto";
// import { registerAdapter } from "../../config/loader";
// import type { OwnerScope } from "../../config/types";
// import type {
// 	ConceptStore,
// 	PersistentExpressionStore,
// } from "../../middleware/dictionary/interfaces";
// import type {
// 	Concept,
// 	ConceptRelation,
// 	CustomExpression,
// 	Namespace,
// } from "../../middleware/dictionary/types";
// import type { EventCommit } from "../../middleware/event/types";
// import type {
// 	FilterCondition,
// 	FilterState,
// } from "../../middleware/filter/types";
// import type { FormState } from "../../middleware/form/types";
// import type { ObjectState } from "../../middleware/object/types";
// import type {
// 	PersistedEventState,
// 	PersistedFilterState,
// 	PersistedFormStateDetails,
// 	PersistedObjectState,
// 	PersistentEventStore,
// 	PersistentFilterStore,
// 	PersistentFormStore,
// 	PersistentObjectStore,
// 	SessionEventStore,
// 	SessionFilterStore,
// 	SessionFormStore,
// 	SessionObjectStore,
// } from "./interfaces";

// async function getConnection(
// 	dbPath: string,
// ): Promise<import("@duckdb/node-api").DuckDBConnection> {
// 	const instance = await DuckDBInstance.create(dbPath, {
// 		allow_unsigned_extensions: "true",
// 	});
// 	return await instance.connect();
// }

// import { SCHEMA } from "./store-schema";

// // ── DuckDB Filter Store ──────────────────────────────────────────

// export class DuckDbFilterStore
// 	implements SessionFilterStore, PersistentFilterStore
// {
// 	private conn!: import("@duckdb/node-api").DuckDBConnection;
// 	private dbPath: string;

// 	constructor(dbPath: string) {
// 		this.dbPath = dbPath;
// 		this.initSchema();
// 	}

// 	private async initSchema(): Promise<void> {
// 		this.conn = await getConnection(this.dbPath);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_FILTERS!.sql);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_FILTER_RULES!.sql);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_SAVED_FILTERS!.sql);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_SESSION_ALIASES!.sql);

// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_FILTERS_SESSION!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_FILTERS_SCOPE!.sql);
// 	}

// 	get(sessionId: string, id: string): Promise<FilterState | null>;
// 	get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") {
// 			return this.getSession(a, b);
// 		}
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, id: string, state: FilterState): Promise<void>;
// 	set(
// 		id: string,
// 		state: PersistedFilterState,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c) {
// 			return this.setPersistent(a, b, c);
// 		}
// 		return this.setSession(a, b, c);
// 	}

// 	delete(sessionId: string, id: string): Promise<void>;
// 	delete(id: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b: string | OwnerScope): Promise<void> {
// 		if (typeof b === "string") {
// 			return this.deleteSession(a, b);
// 		}
// 		return this.deletePersistent(a, b);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_GET_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.length > 0 ? String(rows[0]!.target_id) : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => ({
// 			alias: String(r.alias_name),
// 			targetId: String(r.target_id),
// 		}));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<FilterState, "filterId"> & { filterId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const id = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: FilterState = { ...state, filterId: id };
// 		await this.setSession(sessionId, id, fullState);
// 		if (alias) {
// 			await this.setAlias(sessionId, alias, id);
// 		}
// 		return id;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		id: string,
// 	): Promise<FilterState | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FILTER_SESSION!.sql,
// 			[sessionId, id],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		const row = rows[0]!;

// 		const rulesReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FILTER_RULES!.sql,
// 			[id],
// 		);
// 		const rulesRows = rulesReader.getRowObjectsJS();
// 		const rules: FilterCondition[] = rulesRows.map((r) => ({
// 			property: String(r.property),
// 			operator: r.operator as any,
// 			value: JSON.parse(String(r.value)),
// 		}));

// 		return {
// 			filterId: String(row.filter_id),
// 			toolName: row.tool_name ? String(row.tool_name) : undefined,
// 			tableName: row.table_name ? String(row.table_name) : undefined,
// 			rules,
// 			parentFilterId: row.parent_filter_id
// 				? String(row.parent_filter_id)
// 				: null,
// 			createdAt: String(row.created_at),
// 			combined_operation: row.combined_operation as any,
// 			combined_ids: row.combined_ids
// 				? JSON.parse(String(row.combined_ids))
// 				: null,
// 			schema_snapshot: row.schema_snapshot
// 				? JSON.parse(String(row.schema_snapshot))
// 				: null,
// 		};
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		id: string,
// 		state: FilterState,
// 	): Promise<void> {
// 		const combinedIdsStr = state.combined_ids
// 			? JSON.stringify(state.combined_ids)
// 			: null;
// 		const schemaSnapshotStr = state.schema_snapshot
// 			? JSON.stringify(state.schema_snapshot)
// 			: null;

// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_FILTER!.sql, [
// 				id,
// 				state.toolName || null,
// 				state.tableName || null,
// 				state.parentFilterId || null,
// 				sessionId,
// 				state.combined_operation || null,
// 				combinedIdsStr,
// 				schemaSnapshotStr,
// 			]);

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 				id,
// 			]);
// 			for (let i = 0; i < state.rules.length; i++) {
// 				const rule = state.rules[i]!;
// 				await this.conn.run(SCHEMA.duckdb.inserts.SQL_INSERT_FILTER_RULE!.sql, [
// 					id,
// 					rule.property,
// 					rule.operator,
// 					JSON.stringify(rule.value),
// 					i,
// 				]);
// 			}
// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	private async deleteSession(sessionId: string, id: string): Promise<void> {
// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 				id,
// 			]);
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_DELETE_FILTER_SESSION!.sql,
// 				[sessionId, id],
// 			);
// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	private async getPersistent(
// 		id: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFilterState | null> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;

// 		const savedReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_FILTER!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		const savedRows = savedReader.getRowObjectsJS();
// 		if (savedRows.length === 0) return null;
// 		const saved = savedRows[0]!;

// 		const filterReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FILTER_PERSISTENT!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		const filterRows = filterReader.getRowObjectsJS();
// 		if (filterRows.length === 0) return null;
// 		const row = filterRows[0]!;

// 		const rulesReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FILTER_RULES!.sql,
// 			[id],
// 		);
// 		const rulesRows = rulesReader.getRowObjectsJS();
// 		const rules: FilterCondition[] = rulesRows.map((r) => ({
// 			property: String(r.property),
// 			operator: r.operator as any,
// 			value: JSON.parse(String(r.value)),
// 		}));

// 		return {
// 			filterId: String(row.filter_id),
// 			toolName: row.tool_name ? String(row.tool_name) : undefined,
// 			tableName: row.table_name ? String(row.table_name) : undefined,
// 			rules,
// 			parentFilterId: row.parent_filter_id
// 				? String(row.parent_filter_id)
// 				: null,
// 			createdAt: String(row.created_at),
// 			combined_operation: row.combined_operation as any,
// 			combined_ids: row.combined_ids
// 				? JSON.parse(String(row.combined_ids))
// 				: null,
// 			tags: JSON.parse(String(saved.tags)),
// 			description: String(saved.description),
// 			schema_snapshot: row.schema_snapshot
// 				? JSON.parse(String(row.schema_snapshot))
// 				: "{}",
// 		};
// 	}

// 	private async setPersistent(
// 		id: string,
// 		state: PersistedFilterState,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const combinedIdsStr = state.combined_ids
// 			? JSON.stringify(state.combined_ids)
// 			: null;

// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_FILTER!.sql, [
// 				id,
// 				state.toolName || null,
// 				state.tableName || null,
// 				state.parentFilterId || null,
// 				scope.level,
// 				scopeId,
// 				state.combined_operation || null,
// 				combinedIdsStr,
// 				state.schema_snapshot,
// 			]);

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 				id,
// 			]);
// 			for (let i = 0; i < state.rules.length; i++) {
// 				const rule = state.rules[i]!;
// 				await this.conn.run(SCHEMA.duckdb.inserts.SQL_INSERT_FILTER_RULE!.sql, [
// 					id,
// 					rule.property,
// 					rule.operator,
// 					JSON.stringify(rule.value),
// 					i,
// 				]);
// 			}

// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_SAVED_FILTER!.sql, [
// 				id,
// 				JSON.stringify(state.tags),
// 				state.description,
// 				scope.level,
// 				scopeId,
// 			]);

// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 				id,
// 			]);
// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_SAVED_FILTER!.sql, [
// 				id,
// 			]);
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_DELETE_FILTER_PERSISTENT!.sql,
// 				[id, scope.level],
// 			);
// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFilterState[]> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_FILTERS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		const results: PersistedFilterState[] = [];
// 		for (const saved of rows) {
// 			const tags: string[] = JSON.parse(String(saved.tags));
// 			if (tags.includes(tag)) {
// 				const full = await this.getPersistent(String(saved.id), scope);
// 				if (full) results.push(full);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			scope.level === "global"
// 				? SCHEMA.duckdb.selects.SQL_LIST_SAVED_FILTERS_GLOBAL!.sql
// 				: includeGlobal
// 					? SCHEMA.duckdb.selects.SQL_LIST_SAVED_FILTERS_ALL!.sql
// 					: SCHEMA.duckdb.selects.SQL_LIST_SAVED_FILTERS_USER!.sql,
// 			scope.level === "user" ? [scope.level, userId] : [],
// 		);
// 		const savedRecords = reader.getRowObjectsJS();
// 		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: String(r.user_id) }
// 					: { level: "global" };
// 			const state = await this.getPersistent(String(r.id), recordScope);
// 			if (state) {
// 				results.push({ ...state, scope: recordScope });
// 			}
// 		}
// 		return results;
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_FILTERS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.filter_id));
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_FILTERS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.filter_id));
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		if (olderThanMs !== undefined) {
// 			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_FILTERS_SESSION_AGE!.sql,
// 				[sessionId, cutoff],
// 			);
// 		} else {
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_DELETE_FILTERS_BY_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}
// }

// // ── DuckDB Form Store ────────────────────────────────────────────

// export class DuckDbFormStore implements SessionFormStore, PersistentFormStore {
// 	private conn!: import("@duckdb/node-api").DuckDBConnection;
// 	private dbPath: string;

// 	constructor(dbPath: string) {
// 		this.dbPath = dbPath;
// 		this.initSchema();
// 	}

// 	private async initSchema(): Promise<void> {
// 		this.conn = await getConnection(this.dbPath);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_FORMS!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_FORM_ANSWERS!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_FORM_SKIPPED!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_FORM_STALE!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_SAVED_FORMS!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_FORMS_SESSION!.sql);
// 	}

// 	get(sessionId: string, id: string): Promise<FormState | null>;
// 	get(id: string, scope: OwnerScope): Promise<PersistedFormStateDetails | null>;
// 	async get(a: string, b: any): Promise<any> {
// 		if (typeof b === "string") {
// 			return this.getSession(a, b);
// 		}
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, id: string, state: FormState): Promise<void>;
// 	set(
// 		id: string,
// 		state: PersistedFormStateDetails,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c) {
// 			await this.setPersistent(a, b, c);
// 		} else {
// 			await this.setSession(a, b, c);
// 		}
// 	}

// 	async delete(sessionId: string, id: string): Promise<void>;
// 	async delete(id: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b?: any): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_ANSWERS!.sql, [
// 			a,
// 		]);
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_SKIPPED!.sql, [
// 			a,
// 		]);
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_STALE!.sql, [a]);
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM!.sql, [a]);
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_SAVED_FORM!.sql, [a]);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_GET_FORM_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.length > 0 ? String(rows[0]!.target_id) : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_FORM_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_FORM_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => ({
// 			alias: String(r.alias_name),
// 			targetId: String(r.target_id),
// 		}));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<FormState, "formId"> & { formId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const id = `form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: FormState = { ...state, formId: id };
// 		await this.setSession(sessionId, id, fullState);
// 		if (alias) {
// 			await this.setAlias(sessionId, alias, id);
// 		}
// 		return id;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		id: string,
// 	): Promise<FormState | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FORM_SESSION!.sql,
// 			[id, sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		return this.loadState(rows[0]!);
// 	}

// 	private async getPersistent(
// 		id: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFormStateDetails | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FORM_PERSISTENT!.sql,
// 			[id, scope.level],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		const formRow = rows[0]!;

// 		const savedReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_FORM!.sql,
// 			[id],
// 		);
// 		const savedRows = savedReader.getRowObjectsJS();
// 		const saved = savedRows[0];
// 		const tags = saved ? JSON.parse(String(saved.tags)) : [];
// 		const description = saved ? String(saved.description) : "";

// 		const state = await this.loadState(formRow);
// 		return {
// 			...state,
// 			tags,
// 			description,
// 			schema_pinned_at: String(formRow.created_at),
// 		};
// 	}

// 	private async loadState(row: Record<string, any>): Promise<FormState> {
// 		const formId = String(row.form_id);

// 		const answersReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FORM_ANSWERS!.sql,
// 			[formId],
// 		);
// 		const answersRows = answersReader.getRowObjectsJS();
// 		const answers: Record<string, any> = {};
// 		for (const a of answersRows) {
// 			answers[String(a.question_id)] = JSON.parse(String(a.value));
// 		}

// 		const skippedReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FORM_SKIPPED!.sql,
// 			[formId],
// 		);
// 		const skipped = skippedReader
// 			.getRowObjectsJS()
// 			.map((r) => String(r.question_id));

// 		const staleReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_FORM_STALE!.sql,
// 			[formId],
// 		);
// 		const staleRows = staleReader.getRowObjectsJS();
// 		const stale: Record<string, boolean> = {};
// 		for (const s of staleRows) {
// 			stale[String(s.question_id)] = true;
// 		}

// 		return {
// 			formId,
// 			parentFormId: row.parent_form_id ? String(row.parent_form_id) : null,
// 			schemaName: String(row.schema_name),
// 			answers,
// 			skipped,
// 			stale,
// 			timestamp: String(row.created_at),
// 		};
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		id: string,
// 		state: FormState,
// 	): Promise<void> {
// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_FORM_SESSION!.sql, [
// 				id,
// 				state.parentFormId,
// 				state.schemaName,
// 				sessionId,
// 				state.timestamp,
// 			]);

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_ANSWERS!.sql, [
// 				id,
// 			]);
// 			for (const [qId, val] of Object.entries(state.answers)) {
// 				await this.conn.run(SCHEMA.duckdb.inserts.SQL_INSERT_FORM_ANSWER!.sql, [
// 					id,
// 					qId,
// 					JSON.stringify(val),
// 				]);
// 			}

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_SKIPPED!.sql, [
// 				id,
// 			]);
// 			for (const qId of state.skipped) {
// 				await this.conn.run(
// 					SCHEMA.duckdb.inserts.SQL_INSERT_FORM_SKIPPED!.sql,
// 					[id, qId],
// 				);
// 			}

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_STALE!.sql, [
// 				id,
// 			]);
// 			for (const qId of Object.keys(state.stale)) {
// 				await this.conn.run(SCHEMA.duckdb.inserts.SQL_INSERT_FORM_STALE!.sql, [
// 					id,
// 					qId,
// 				]);
// 			}

// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	private async setPersistent(
// 		id: string,
// 		state: PersistedFormStateDetails,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(
// 				SCHEMA.duckdb.inserts.SQL_UPSERT_FORM_PERSISTENT!.sql,
// 				[
// 					id,
// 					state.parentFormId,
// 					state.schemaName,
// 					scope.level,
// 					userId,
// 					state.timestamp,
// 				],
// 			);

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_ANSWERS!.sql, [
// 				id,
// 			]);
// 			for (const [qId, val] of Object.entries(state.answers)) {
// 				await this.conn.run(SCHEMA.duckdb.inserts.SQL_INSERT_FORM_ANSWER!.sql, [
// 					id,
// 					qId,
// 					JSON.stringify(val),
// 				]);
// 			}

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_SKIPPED!.sql, [
// 				id,
// 			]);
// 			for (const qId of state.skipped) {
// 				await this.conn.run(
// 					SCHEMA.duckdb.inserts.SQL_INSERT_FORM_SKIPPED!.sql,
// 					[id, qId],
// 				);
// 			}

// 			await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_FORM_STALE!.sql, [
// 				id,
// 			]);
// 			for (const qId of Object.keys(state.stale)) {
// 				await this.conn.run(SCHEMA.duckdb.inserts.SQL_INSERT_FORM_STALE!.sql, [
// 					id,
// 					qId,
// 				]);
// 			}

// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_SAVED_FORM!.sql, [
// 				id,
// 				JSON.stringify(state.tags),
// 				state.description,
// 				scope.level,
// 				userId,
// 				state.timestamp,
// 			]);

// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFormStateDetails[]> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_FORMS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		const results: PersistedFormStateDetails[] = [];
// 		for (const saved of rows) {
// 			const tags: string[] = JSON.parse(String(saved.tags));
// 			if (tags.includes(tag)) {
// 				const full = await this.getPersistent(String(saved.id), scope);
// 				if (full) results.push(full);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			scope.level === "global"
// 				? SCHEMA.duckdb.selects.SQL_LIST_SAVED_FORMS_GLOBAL!.sql
// 				: includeGlobal
// 					? SCHEMA.duckdb.selects.SQL_LIST_SAVED_FORMS_ALL!.sql
// 					: SCHEMA.duckdb.selects.SQL_LIST_SAVED_FORMS_USER!.sql,
// 			scope.level === "user" ? [scope.level, userId] : [],
// 		);
// 		const savedRecords = reader.getRowObjectsJS();
// 		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> =
// 			[];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: String(r.user_id) }
// 					: { level: "global" };
// 			const state = await this.getPersistent(String(r.id), recordScope);
// 			if (state) {
// 				results.push({ ...state, scope: recordScope });
// 			}
// 		}
// 		return results;
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_FORMS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.form_id));
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_FORMS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.form_id));
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		if (olderThanMs !== undefined) {
// 			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_FORMS_BY_SESSION_AGE!.sql,
// 				[sessionId, cutoff],
// 			);
// 		} else {
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_FORMS_BY_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}
// }

// // ── DuckDB Concept Store ─────────────────────────────────────────

// export class DuckDbConceptStore implements ConceptStore {
// 	private conn!: import("@duckdb/node-api").DuckDBConnection;
// 	private dbPath: string;

// 	constructor(dbPath: string) {
// 		this.dbPath = dbPath;
// 		this.initSchema();
// 	}

// 	private async initSchema(): Promise<void> {
// 		this.conn = await getConnection(this.dbPath);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_DICT_NAMESPACES!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_DICT_CONCEPTS!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_DICT_RELATIONS!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_CONCEPT_REL_FORWARD!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_CONCEPT_REL_REVERSE!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_DICT_RELATION_CACHE!.sql);
// 		await this.conn.run(
// 			SCHEMA.duckdb.ddlIndexes.IDX_CONCEPT_CACHE_TRAVERSAL!.sql,
// 		);
// 	}

// 	async search(
// 		query: string,
// 		namespaceCode?: string,
// 		limit: number = 50,
// 	): Promise<Concept[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			namespaceCode
// 				? SCHEMA.duckdb.selects.SQL_SEARCH_DICT_CONCEPTS_BY_NAMESPACE!.sql
// 				: SCHEMA.duckdb.selects.SQL_SEARCH_DICT_CONCEPTS!.sql,
// 			[
// 				`%${query}%`,
// 				query,
// 				query,
// 				`%${query}%`,
// 				...(namespaceCode ? [namespaceCode] : []),
// 			],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r: any) => ({
// 			id: String(r.id),
// 			namespaceCode: String(r.namespace_code),
// 			standardCode: String(r.standard_code),
// 			display: String(r.display),
// 			description: r.description ? String(r.description) : undefined,
// 			designationDate: r.designation_date
// 				? String(r.designation_date)
// 				: undefined,
// 			active: Boolean(r.active),
// 		}));
// 	}

// 	async getById(id: string): Promise<Concept | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_DICT_CONCEPT_BY_ID!.sql,
// 			[id],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		const r = rows[0]!;
// 		return {
// 			id: String(r.id),
// 			namespaceCode: String(r.namespace_code),
// 			standardCode: String(r.standard_code),
// 			display: String(r.display),
// 			description: r.description ? String(r.description) : undefined,
// 			designationDate: r.designation_date
// 				? String(r.designation_date)
// 				: undefined,
// 			active: Boolean(r.active),
// 		};
// 	}

// 	async listNamespaces(): Promise<Namespace[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_DICT_NAMESPACES!.sql,
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r: any) => ({
// 			code: String(r.code),
// 			description: r.description ? String(r.description) : undefined,
// 			isPublic: Boolean(r.is_public),
// 			isExternalPrivate: Boolean(r.is_external_private),
// 			isMutable: r.is_mutable !== undefined ? Boolean(r.is_mutable) : undefined,
// 		}));
// 	}

// 	async addConcept(concept: Concept): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_DICT_CONCEPT!.sql, [
// 			concept.id,
// 			concept.namespaceCode,
// 			concept.standardCode,
// 			concept.display,
// 			concept.description || null,
// 			concept.designationDate || null,
// 			concept.active !== false,
// 		]);
// 	}

// 	async addNamespace(namespace: Namespace): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_DICT_NAMESPACE!.sql, [
// 			namespace.code,
// 			namespace.description || null,
// 			namespace.isPublic,
// 			namespace.isExternalPrivate,
// 			namespace.isMutable !== false,
// 		]);
// 	}

// 	async addRelation(relation: ConceptRelation): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_DICT_RELATION!.sql, [
// 			relation.id,
// 			relation.conceptId,
// 			relation.linkedId,
// 			relation.relationshipType,
// 			relation.active !== false,
// 			relation.designationDate || null,
// 		]);
// 	}
// }

// // ── DuckDB Persistent Expression Store ───────────────────────────

// export class DuckDbPersistentExpressionStore
// 	implements PersistentExpressionStore
// {
// 	private conn!: import("@duckdb/node-api").DuckDBConnection;
// 	private dbPath: string;

// 	constructor(dbPath: string) {
// 		this.dbPath = dbPath;
// 		this.initSchema();
// 	}

// 	private async initSchema(): Promise<void> {
// 		this.conn = await getConnection(this.dbPath);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_DICT_CUSTOM_EXPRESSIONS!.sql);
// 	}

// 	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_DICT_EXPRESSION!.sql, [
// 			expression.id,
// 			expression.term,
// 			expression.conceptId || null,
// 			scope.level,
// 			scopeId,
// 			JSON.stringify(expression),
// 		]);
// 	}

// 	async delete(id: string, scope: OwnerScope): Promise<void> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_DICT_EXPRESSION!.sql, [
// 			id,
// 			scope.level,
// 			scopeId,
// 		]);
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<CustomExpression[]> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			scope.level === "global" || !includeGlobal
// 				? SCHEMA.duckdb.selects.SQL_SELECT_DICT_EXPRESSION_USER!.sql
// 				: SCHEMA.duckdb.selects.SQL_SELECT_DICT_EXPRESSION_ALL!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r: any) => JSON.parse(String(r.data)));
// 	}

// 	async getById(id: string): Promise<CustomExpression | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_DICT_EXPRESSION_DATA!.sql,
// 			[id],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		return JSON.parse(String(rows[0]!.data));
// 	}
// }

// // ── DuckDB Object Store ──────────────────────────────────────────

// export class DuckDbObjectStore
// 	implements SessionObjectStore, PersistentObjectStore
// {
// 	private conn!: import("@duckdb/node-api").DuckDBConnection;
// 	private dbPath: string;

// 	constructor(dbPath: string) {
// 		this.dbPath = dbPath;
// 		this.initSchema();
// 	}

// 	private async initSchema(): Promise<void> {
// 		this.conn = await getConnection(this.dbPath);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_OBJECTS!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_SAVED_OBJECTS!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_OBJECTS_SESSION!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_OBJECTS_SCOPE!.sql);
// 	}

// 	get(sessionId: string, id: string): Promise<ObjectState | null>;
// 	get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") {
// 			return this.getSession(a, b);
// 		}
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, id: string, state: ObjectState): Promise<void>;
// 	set(
// 		id: string,
// 		state: PersistedObjectState,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c) {
// 			return this.setPersistent(a, b, c);
// 		}
// 		return this.setSession(a, b, c);
// 	}

// 	delete(sessionId: string, id: string): Promise<void>;
// 	delete(id: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b: string | OwnerScope): Promise<void> {
// 		if (typeof b === "string") {
// 			return this.deleteSession(a, b);
// 		}
// 		return this.deletePersistent(a, b);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_GET_OBJECT_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.length > 0 ? String(rows[0]!.target_id) : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_OBJECT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_OBJECT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_OBJECT_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => ({
// 			alias: String(r.alias_name),
// 			targetId: String(r.target_id),
// 		}));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<ObjectState, "objectId"> & { objectId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const id = `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: ObjectState = { ...state, objectId: id };
// 		await this.setSession(sessionId, id, fullState);
// 		if (alias) {
// 			await this.setAlias(sessionId, alias, id);
// 		}
// 		return id;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		id: string,
// 	): Promise<ObjectState | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_OBJECT_SESSION!.sql,
// 			[sessionId, id],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		return this.loadState(rows[0]!);
// 	}

// 	private loadState(row: Record<string, any>): ObjectState {
// 		return {
// 			objectId: String(row.object_id),
// 			schemaName: String(row.schema_name),
// 			parentObjectId: row.parent_object_id
// 				? String(row.parent_object_id)
// 				: null,
// 			data: JSON.parse(String(row.data)),
// 			createdAt: String(row.created_at),
// 			schema_pinned_at: row.schema_pinned_at
// 				? String(row.schema_pinned_at)
// 				: undefined,
// 			linearDepth: row.linear_depth ? Number(row.linear_depth) : undefined,
// 			gcLock: Boolean(row.gc_lock),
// 		};
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		id: string,
// 		state: ObjectState,
// 	): Promise<void> {
// 		const dataStr = JSON.stringify(state.data);
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_OBJECT_SESSION!.sql, [
// 			id,
// 			state.schemaName,
// 			state.parentObjectId || null,
// 			sessionId,
// 			dataStr,
// 			state.createdAt,
// 			state.schema_pinned_at || null,
// 		]);
// 	}

// 	private async deleteSession(sessionId: string, id: string): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_OBJECT_SESSION!.sql, [
// 			sessionId,
// 			id,
// 		]);
// 	}

// 	private async getPersistent(
// 		id: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedObjectState | null> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;

// 		const savedReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_OBJECT!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		const savedRows = savedReader.getRowObjectsJS();
// 		if (savedRows.length === 0) return null;
// 		const saved = savedRows[0]!;

// 		const objReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_OBJECT_PERSISTENT!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		const objRows = objReader.getRowObjectsJS();
// 		if (objRows.length === 0) return null;
// 		const row = objRows[0]!;

// 		return {
// 			...this.loadState(row),
// 			tags: JSON.parse(String(saved.tags)),
// 			description: String(saved.description),
// 			schema_pinned_at: row.schema_pinned_at
// 				? String(row.schema_pinned_at)
// 				: "",
// 		};
// 	}

// 	private async setPersistent(
// 		id: string,
// 		state: PersistedObjectState,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const dataStr = JSON.stringify(state.data);

// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(
// 				SCHEMA.duckdb.inserts.SQL_UPSERT_OBJECT_PERSISTENT!.sql,
// 				[
// 					id,
// 					state.schemaName,
// 					state.parentObjectId || null,
// 					scope.level,
// 					scopeId,
// 					dataStr,
// 					state.createdAt,
// 					state.schema_pinned_at || null,
// 				],
// 			);

// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_SAVED_OBJECT!.sql, [
// 				id,
// 				JSON.stringify(state.tags),
// 				state.description,
// 				scope.level,
// 				scopeId,
// 			]);

// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_SAVED_OBJECT!.sql, [
// 			id,
// 		]);
// 		await this.conn.run(
// 			SCHEMA.duckdb.deletes.SQL_DELETE_OBJECT_PERSISTENT!.sql,
// 			[id, scope.level],
// 		);
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedObjectState[]> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_OBJECTS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		const results: PersistedObjectState[] = [];
// 		for (const saved of rows) {
// 			const tags: string[] = JSON.parse(String(saved.tags));
// 			if (tags.includes(tag)) {
// 				const full = await this.getPersistent(String(saved.id), scope);
// 				if (full) results.push(full);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			scope.level === "global"
// 				? SCHEMA.duckdb.selects.SQL_LIST_SAVED_OBJECTS_GLOBAL!.sql
// 				: includeGlobal
// 					? SCHEMA.duckdb.selects.SQL_LIST_SAVED_OBJECTS_ALL!.sql
// 					: SCHEMA.duckdb.selects.SQL_LIST_SAVED_OBJECTS_USER!.sql,
// 			scope.level === "user" ? [scope.level, userId] : [],
// 		);
// 		const savedRecords = reader.getRowObjectsJS();
// 		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: String(r.user_id) }
// 					: { level: "global" };
// 			const state = await this.getPersistent(String(r.id), recordScope);
// 			if (state) {
// 				results.push({ ...state, scope: recordScope });
// 			}
// 		}
// 		return results;
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_OBJECTS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.object_id));
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_OBJECTS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.object_id));
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		if (olderThanMs !== undefined) {
// 			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_OBJECTS_SESSION_AGE!.sql,
// 				[sessionId, cutoff],
// 			);
// 		} else {
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_OBJECTS_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}
// }

// // ── DuckDB Event Store ───────────────────────────────────────────

// export class DuckDbEventStore
// 	implements SessionEventStore, PersistentEventStore
// {
// 	private conn!: import("@duckdb/node-api").DuckDBConnection;
// 	private dbPath: string;

// 	constructor(dbPath: string) {
// 		this.dbPath = dbPath;
// 		this.initSchema();
// 	}

// 	private async initSchema(): Promise<void> {
// 		this.conn = await getConnection(this.dbPath);

// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_EVENTS!.sql);
// 		this.conn.run(SCHEMA.duckdb.ddl.DDL_SAVED_EVENTS!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_EVENTS_SESSION!.sql);
// 		await this.conn.run(SCHEMA.duckdb.ddlIndexes.IDX_EVENTS_SCOPE!.sql);
// 	}

// 	get(sessionId: string, commitId: string): Promise<EventCommit | null>;
// 	get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") {
// 			return this.getSession(a, b);
// 		}
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, commitId: string, state: EventCommit): Promise<void>;
// 	set(
// 		commitId: string,
// 		state: PersistedEventState,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c) {
// 			return this.setPersistent(a, b, c);
// 		}
// 		return this.setSession(a, b, c);
// 	}

// 	delete(sessionId: string, commitId: string): Promise<void>;
// 	delete(commitId: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b: string | OwnerScope): Promise<void> {
// 		if (typeof b === "string") {
// 			return this.deleteSession(a, b);
// 		}
// 		return this.deletePersistent(a, b);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_GET_OBJECT_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.length > 0 ? String(rows[0]!.target_id) : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_OBJECT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_OBJECT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_OBJECT_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => ({
// 			alias: String(r.alias_name),
// 			targetId: String(r.target_id),
// 		}));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<EventCommit, "commitId"> & { commitId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const id = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: EventCommit = { ...state, commitId: id };
// 		await this.setSession(sessionId, id, fullState);
// 		if (alias) {
// 			await this.setAlias(sessionId, alias, id);
// 		}
// 		return id;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		commitId: string,
// 	): Promise<EventCommit | null> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_EVENT_SESSION!.sql,
// 			[sessionId, commitId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		if (rows.length === 0) return null;
// 		const row = rows[0]!;
// 		return this.loadState(row);
// 	}

// 	private loadState(row: Record<string, any>): EventCommit {
// 		return {
// 			commitId: String(row.commit_id),
// 			sessionId: String(row.session_id),
// 			parentCommitId: row.parent_commit_id
// 				? String(row.parent_commit_id)
// 				: null,
// 			createdAt: String(row.created_at),
// 			operation: row.operation as "add" | "update" | "remove" | "merge",
// 			mutations: JSON.parse(String(row.mutations)),
// 			linearDepth: row.linear_depth ? Number(row.linear_depth) : 0,
// 			gcLock: Boolean(row.gc_lock),
// 			mergeSourceCommitIds: row.merge_source_commit_ids
// 				? JSON.parse(String(row.merge_source_commit_ids))
// 				: undefined,
// 			mergeAcceptedIds: row.merge_accepted_ids
// 				? JSON.parse(String(row.merge_accepted_ids))
// 				: undefined,
// 			mergeRejectedIds: row.merge_rejected_ids
// 				? JSON.parse(String(row.merge_rejected_ids))
// 				: undefined,
// 		};
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		commitId: string,
// 		state: EventCommit,
// 	): Promise<void> {
// 		const mutationsStr = JSON.stringify(state.mutations);
// 		const mergeSourceIds = state.mergeSourceCommitIds
// 			? JSON.stringify(state.mergeSourceCommitIds)
// 			: null;
// 		const mergeAcceptedIds = state.mergeAcceptedIds
// 			? JSON.stringify(state.mergeAcceptedIds)
// 			: null;
// 		const mergeRejectedIds = state.mergeRejectedIds
// 			? JSON.stringify(state.mergeRejectedIds)
// 			: null;

// 		await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_EVENT_SESSION!.sql, [
// 			commitId,
// 			sessionId,
// 			state.parentCommitId,
// 			state.operation,
// 			mutationsStr,
// 			state.createdAt,
// 			state.linearDepth,
// 			state.gcLock,
// 			mergeSourceIds,
// 			mergeAcceptedIds,
// 			mergeRejectedIds,
// 		]);
// 	}

// 	private async deleteSession(
// 		sessionId: string,
// 		commitId: string,
// 	): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_EVENT_SESSION!.sql, [
// 			sessionId,
// 			commitId,
// 		]);
// 	}

// 	private async getPersistent(
// 		commitId: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedEventState | null> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;

// 		const savedReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_EVENT!.sql,
// 			[commitId, scope.level, scopeId],
// 		);
// 		const savedRows = savedReader.getRowObjectsJS();
// 		if (savedRows.length === 0) return null;
// 		const saved = savedRows[0]!;

// 		const eventReader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_EVENT_PERSISTENT!.sql,
// 			[commitId, scope.level, scopeId],
// 		);
// 		const eventRows = eventReader.getRowObjectsJS();
// 		if (eventRows.length === 0) return null;
// 		const row = eventRows[0]!;

// 		return {
// 			...this.loadState(row),
// 			tags: JSON.parse(String(saved.tags)),
// 			description: String(saved.description),
// 			schema_name: String(row.schema_name),
// 		};
// 	}

// 	private async setPersistent(
// 		commitId: string,
// 		state: PersistedEventState,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const mutationsStr = JSON.stringify(state.mutations);
// 		const mergeSourceIds = state.mergeSourceCommitIds
// 			? JSON.stringify(state.mergeSourceCommitIds)
// 			: null;
// 		const mergeAcceptedIds = state.mergeAcceptedIds
// 			? JSON.stringify(state.mergeAcceptedIds)
// 			: null;
// 		const mergeRejectedIds = state.mergeRejectedIds
// 			? JSON.stringify(state.mergeRejectedIds)
// 			: null;

// 		await this.conn.run("BEGIN");
// 		try {
// 			await this.conn.run(
// 				SCHEMA.duckdb.inserts.SQL_UPSERT_EVENT_PERSISTENT!.sql,
// 				[
// 					commitId,
// 					scope.level,
// 					scopeId,
// 					state.parentCommitId,
// 					state.operation,
// 					mutationsStr,
// 					state.createdAt,
// 					state.linearDepth,
// 					state.gcLock,
// 					mergeSourceIds,
// 					mergeAcceptedIds,
// 					mergeRejectedIds,
// 					state.schema_name,
// 				],
// 			);

// 			await this.conn.run(SCHEMA.duckdb.inserts.SQL_UPSERT_SAVED_EVENT!.sql, [
// 				commitId,
// 				JSON.stringify(state.tags),
// 				state.description,
// 				scope.level,
// 				scopeId,
// 			]);

// 			await this.conn.run("COMMIT");
// 		} catch (err) {
// 			await this.conn.run("ROLLBACK");
// 			throw err;
// 		}
// 	}

// 	private async deletePersistent(
// 		commitId: string,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		await this.conn.run(SCHEMA.duckdb.deletes.SQL_DELETE_SAVED_EVENT!.sql, [
// 			commitId,
// 		]);
// 		await this.conn.run(
// 			SCHEMA.duckdb.deletes.SQL_DELETE_EVENT_PERSISTENT!.sql,
// 			[commitId, scope.level],
// 		);
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedEventState[]> {
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_SELECT_SAVED_EVENTS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		const results: PersistedEventState[] = [];
// 		for (const saved of rows) {
// 			const tags: string[] = JSON.parse(String(saved.tags));
// 			if (tags.includes(tag)) {
// 				const full = await this.getPersistent(String(saved.id), scope);
// 				if (full) results.push(full);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		const reader = await this.conn.runAndReadAll(
// 			scope.level === "global"
// 				? SCHEMA.duckdb.selects.SQL_LIST_SAVED_EVENTS_GLOBAL!.sql
// 				: includeGlobal
// 					? SCHEMA.duckdb.selects.SQL_LIST_SAVED_EVENTS_ALL!.sql
// 					: SCHEMA.duckdb.selects.SQL_LIST_SAVED_EVENTS_USER!.sql,
// 			scope.level === "user" ? [scope.level, userId] : [],
// 		);
// 		const savedRecords = reader.getRowObjectsJS();
// 		const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: String(r.user_id) }
// 					: { level: "global" };
// 			const state = await this.getPersistent(String(r.id), recordScope);
// 			if (state) {
// 				results.push({ ...state, scope: recordScope });
// 			}
// 		}
// 		return results;
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_EVENTS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.commit_id));
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		const reader = await this.conn.runAndReadAll(
// 			SCHEMA.duckdb.selects.SQL_LIST_EVENTS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		const rows = reader.getRowObjectsJS();
// 		return rows.map((r) => String(r.commit_id));
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		if (olderThanMs !== undefined) {
// 			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_EVENTS_SESSION_AGE!.sql,
// 				[sessionId, cutoff],
// 			);
// 		} else {
// 			await this.conn.run(
// 				SCHEMA.duckdb.deletes.SQL_EXPIRE_EVENTS_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}
// }

// // ── Registry Registration ────────────────────────────────────────

// registerAdapter("duckdb", {
// 	create: async (options) => {
// 		const dbPath = String(options.path || "./duckdb.db");
// 		return {
// 			sessionFilter: new DuckDbFilterStore(dbPath),
// 			persistentFilter: new DuckDbFilterStore(dbPath),
// 			sessionObject: new DuckDbObjectStore(dbPath),
// 			persistentObject: new DuckDbObjectStore(dbPath),
// 			sessionEvent: new DuckDbEventStore(dbPath),
// 			persistentEvent: new DuckDbEventStore(dbPath),
// 			sessionForm: new DuckDbFormStore(dbPath),
// 			persistentForm: new DuckDbFormStore(dbPath),
// 			conceptStore: new DuckDbConceptStore(dbPath),
// 			persistentExpressionStore: new DuckDbPersistentExpressionStore(dbPath),
// 		};
// 	},
// });
