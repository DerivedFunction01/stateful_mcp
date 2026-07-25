// import { Database } from "bun:sqlite";
// import * as crypto from "crypto";
// import * as fs from "fs";
// import * as path from "path";
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
// 	RelatedConceptResult,
// 	TraversalDirection,
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
// import { SCHEMA } from "./store-schema";

// /**
//  * OPFS SQLite Bridge
//  * Uses @sqlite.org/sqlite-wasm sqlite3Worker1Promiser when available (browser),
//  * falls back to bun:sqlite when Worker is unavailable (Node.js/Bun).
//  */
// export class OpfsDb {
// 	private promiser: any = null;
// 	private dbId: any = null;
// 	private ready = false;
// 	private fallback = false;
// 	private sqlite: Database | null = null;

// 	constructor(
// 		private dbName: string = "stateful_mcp_opfs.sqlite3",
// 		private workerUrl?: string,
// 	) {}

// 	async open(): Promise<void> {
// 		if (typeof Worker === "undefined") {
// 			this.fallback = true;
// 			const dir = path.dirname(this.dbName);
// 			if (dir !== "." && !fs.existsSync(dir)) {
// 				fs.mkdirSync(dir, { recursive: true });
// 			}
// 			this.sqlite = new Database(this.dbName);
// 			this.sqlite.run("PRAGMA journal_mode = WAL;");
// 			return;
// 		}
// 		try {
// 			const { sqlite3Worker1Promiser } = await import(
// 				"@sqlite.org/sqlite-wasm"
// 			);
// 			const workerScript =
// 				this.workerUrl ||
// 				new URL(
// 					"node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-worker1.mjs",
// 					import.meta.url,
// 				).href;
// 			const worker = new Worker(workerScript, { type: "module" });
// 			this.promiser = await sqlite3Worker1Promiser.v2({ worker });
// 			const result = await this.promiser("open", { filename: this.dbName });
// 			this.dbId = result.dbId;
// 			this.ready = true;
// 		} catch {
// 			this.fallback = true;
// 			const dir = path.dirname(this.dbName);
// 			if (dir !== "." && !fs.existsSync(dir)) {
// 				fs.mkdirSync(dir, { recursive: true });
// 			}
// 			this.sqlite = new Database(this.dbName);
// 			this.sqlite.run("PRAGMA journal_mode = WAL;");
// 		}
// 	}

// 	async exec(
// 		sql: string,
// 		params?: readonly unknown[],
// 	): Promise<{ changes?: number; lastInsertRowId?: bigint }> {
// 		if (this.sqlite) {
// 			const result = (
// 				params ? this.sqlite.run(sql, params as any) : this.sqlite.run(sql)
// 			) as any;
// 			return {
// 				changes: result.changes,
// 				lastInsertRowId: result.lastInsertRowid,
// 			};
// 		}
// 		if (!this.ready) await this.open();
// 		if (this.promiser) {
// 			const result = await this.promiser("exec", {
// 				sql,
// 				bind: params as any,
// 				rowMode: "object" as const,
// 				returnValue: "resultRows" as const,
// 			});
// 			return {
// 				changes: (result as any).changeCount as number,
// 				lastInsertRowId: (result as any).lastInsertRowId as bigint | undefined,
// 			};
// 		}
// 		return {};
// 	}

// 	async query<T = Record<string, any>>(
// 		sql: string,
// 		params?: readonly unknown[],
// 	): Promise<T[]> {
// 		if (this.sqlite) {
// 			try {
// 				return (
// 					params
// 						? this.sqlite.query(sql).all(...(params as any[]))
// 						: this.sqlite.query(sql).all()
// 				) as T[];
// 			} catch {
// 				if (params) this.sqlite.run(sql, params as any);
// 				else this.sqlite.run(sql);
// 				return [];
// 			}
// 		}
// 		if (!this.ready) await this.open();
// 		if (this.promiser) {
// 			const result = await this.promiser("exec", {
// 				sql,
// 				bind: params as any,
// 				rowMode: "object" as const,
// 				returnValue: "resultRows" as const,
// 			});
// 			return ((result as any).resultRows || []) as T[];
// 		}
// 		return [];
// 	}

// 	async get<T = Record<string, any>>(
// 		sql: string,
// 		params?: readonly unknown[],
// 	): Promise<T | null> {
// 		if (this.sqlite) {
// 			const row = params
// 				? this.sqlite.query(sql).get(...(params as any[]))
// 				: this.sqlite.query(sql).get();
// 			return (row ?? null) as T | null;
// 		}
// 		const rows = await this.query<T>(sql, params);
// 		return rows.length > 0 ? (rows[0] ?? null) : null;
// 	}

// 	async close(): Promise<void> {
// 		if (this.promiser) {
// 			await this.promiser("close", {});
// 		}
// 		this.sqlite?.close();
// 	}

// 	isFallback(): boolean {
// 		return this.fallback;
// 	}
// }

// // ── OPFS Filter Store ─────────────────────────────────────────────────────────

// export class OpfsFilterStore
// 	implements SessionFilterStore, PersistentFilterStore
// {
// 	private db: OpfsDb;
// 	private initDone = false;

// 	constructor(db: OpfsDb) {
// 		this.db = db;
// 	}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(SCHEMA.sqlite.pragma);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FILTERS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FILTER_RULES!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_SAVED_FILTERS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_SESSION_ALIASES!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddlIndexes.IDX_FILTERS_SESSION!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddlIndexes.IDX_FILTERS_SCOPE!.sql);
// 		this.initDone = true;
// 	}

// 	get(sessionId: string, id: string): Promise<FilterState | null>;
// 	get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") {
// 			return this.getSession(a, b);
// 		} else {
// 			return this.getPersistent(a, b);
// 		}
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
// 		} else {
// 			return this.setSession(a, b, c);
// 		}
// 	}

// 	delete(sessionId: string, id: string): Promise<void>;
// 	delete(id: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b: string | OwnerScope): Promise<void> {
// 		if (typeof b === "string") {
// 			return this.deleteSession(a, b);
// 		} else {
// 			return this.deletePersistent(a, b);
// 		}
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<{ target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_GET_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		return row ? row.target_id : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ alias_name: string; target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
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
// 		await this.ensureInit();
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FILTER_SESSION!.sql,
// 			[sessionId, id],
// 		);
// 		if (!row) return null;

// 		const rulesRows = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FILTER_RULES!.sql,
// 			[id],
// 		);
// 		const rules: FilterCondition[] = rulesRows.map((r: any) => ({
// 			property: r.property,
// 			operator: r.operator as any,
// 			value: JSON.parse(r.value),
// 		}));

// 		return {
// 			filterId: row.filter_id,
// 			toolName: row.tool_name || undefined,
// 			tableName: row.table_name || undefined,
// 			rules,
// 			parentFilterId: row.parent_filter_id,
// 			createdAt: row.created_at,
// 			combined_operation: row.combined_operation as any,
// 			combined_ids: row.combined_ids ? JSON.parse(row.combined_ids) : null,
// 			schema_snapshot: row.schema_snapshot
// 				? JSON.parse(row.schema_snapshot)
// 				: null,
// 		};
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		id: string,
// 		state: FilterState,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		const combinedIdsStr = state.combined_ids
// 			? JSON.stringify(state.combined_ids)
// 			: null;
// 		const schemaSnapshotStr = state.schema_snapshot
// 			? JSON.stringify(state.schema_snapshot)
// 			: null;

// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_FILTER!.sql, [
// 			id,
// 			state.toolName || null,
// 			state.tableName || null,
// 			state.parentFilterId || null,
// 			"session",
// 			sessionId,
// 			null,
// 			state.combined_operation || null,
// 			combinedIdsStr,
// 			schemaSnapshotStr,
// 		]);

// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 			id,
// 		]);
// 		for (const [idx, rule] of state.rules.entries()) {
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FILTER_RULE!.sql, [
// 				id,
// 				rule.property,
// 				rule.operator,
// 				JSON.stringify(rule.value),
// 				idx,
// 			]);
// 		}
// 	}

// 	private async deleteSession(sessionId: string, id: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 			id,
// 		]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_SESSION!.sql, [
// 			sessionId,
// 			id,
// 		]);
// 	}

// 	private async getPersistent(
// 		id: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFilterState | null> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;

// 		const saved = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_FILTER!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		if (!saved) return null;

// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FILTER_PERSISTENT!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		if (!row) return null;

// 		const rulesRows = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FILTER_RULES!.sql,
// 			[id],
// 		);
// 		const rules: FilterCondition[] = rulesRows.map((r: any) => ({
// 			property: r.property,
// 			operator: r.operator as any,
// 			value: JSON.parse(r.value),
// 		}));

// 		return {
// 			filterId: row.filter_id,
// 			toolName: row.tool_name || undefined,
// 			tableName: row.table_name || undefined,
// 			rules,
// 			parentFilterId: row.parent_filter_id,
// 			createdAt: row.created_at,
// 			combined_operation: row.combined_operation as any,
// 			combined_ids: row.combined_ids ? JSON.parse(row.combined_ids) : null,
// 			tags: JSON.parse(saved.tags),
// 			description: saved.description,
// 			schema_snapshot: row.schema_snapshot
// 				? JSON.parse(row.schema_snapshot)
// 				: "{}",
// 		};
// 	}

// 	private async setPersistent(
// 		id: string,
// 		state: PersistedFilterState,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const combinedIdsStr = state.combined_ids
// 			? JSON.stringify(state.combined_ids)
// 			: null;

// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_FILTER!.sql, [
// 			id,
// 			state.toolName || null,
// 			state.tableName || null,
// 			state.parentFilterId || null,
// 			scope.level,
// 			null,
// 			scopeId,
// 			state.combined_operation || null,
// 			combinedIdsStr,
// 			state.schema_snapshot,
// 		]);

// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 			id,
// 		]);
// 		for (const [idx, rule] of state.rules.entries()) {
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FILTER_RULE!.sql, [
// 				id,
// 				rule.property,
// 				rule.operator,
// 				JSON.stringify(rule.value),
// 				idx,
// 			]);
// 		}

// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_FILTER!.sql, [
// 			id,
// 			JSON.stringify(state.tags),
// 			state.description,
// 			scope.level,
// 			scopeId,
// 		]);
// 	}

// 	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 			id,
// 		]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_SAVED_FILTER!.sql, [
// 			id,
// 		]);
// 		await this.db.exec(
// 			SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_PERSISTENT!.sql,
// 			[id, scope.level],
// 		);
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ filter_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_FILTERS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => r.filter_id);
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ filter_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_FILTERS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		return rows.map((r) => r.filter_id);
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		await this.ensureInit();
// 		if (olderThanMs !== undefined) {
// 			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
// 			const rows = await this.db.query<{ filter_id: string }>(
// 				SCHEMA.sqlite.selects.SQL_EXPIRE_FILTERS_SESSION_FIND!.sql,
// 				[sessionId, olderThanDate],
// 			);
// 			for (const r of rows) {
// 				await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES!.sql, [
// 					r.filter_id,
// 				]);
// 				await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_BY_ID!.sql, [
// 					r.filter_id,
// 				]);
// 			}
// 		} else {
// 			await this.db.exec(
// 				SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES_BY_SESSION!.sql,
// 				[sessionId],
// 			);
// 			await this.db.exec(
// 				SCHEMA.sqlite.deletes.SQL_DELETE_FILTERS_BY_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFilterState[]> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const allSaved = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_FILTERS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);

// 		const results: PersistedFilterState[] = [];
// 		for (const saved of allSaved) {
// 			const tags: string[] = JSON.parse(saved.tags);
// 			if (tags.includes(tag)) {
// 				const fullState = await this.getPersistent(saved.id, scope);
// 				if (fullState) results.push(fullState);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
// 		await this.ensureInit();
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		let queryStr =
// 			"SELECT id, scope_level, user_id FROM saved_filters WHERE (scope_level = 'global')";
// 		const params: any[] = [];
// 		if (scope.level === "user") {
// 			if (includeGlobal) {
// 				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
// 				params.push(userId);
// 			} else {
// 				queryStr =
// 					"SELECT id, scope_level, user_id FROM saved_filters WHERE scope_level = 'user' AND user_id = ?";
// 				params.push(userId);
// 			}
// 		}

// 		const savedRecords = await this.db.query<any>(queryStr, params);
// 		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: r.user_id }
// 					: { level: "global" };
// 			const state = await this.getPersistent(r.id, recordScope);
// 			if (state) {
// 				results.push({ ...state, scope: recordScope });
// 			}
// 		}
// 		return results;
// 	}
// }

// // ── OPFS Object Store ─────────────────────────────────────────────────────────

// export class OpfsObjectStore
// 	implements SessionObjectStore, PersistentObjectStore
// {
// 	private db: OpfsDb;
// 	private initDone = false;

// 	constructor(db: OpfsDb) {
// 		this.db = db;
// 	}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(SCHEMA.sqlite.pragma);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_OBJECTS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_SAVED_OBJECTS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_OBJECT_SESSION_ALIASES!.sql);
// 		this.initDone = true;
// 	}

// 	get(sessionId: string, id: string): Promise<ObjectState | null>;
// 	get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") return this.getSession(a, b);
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, id: string, state: ObjectState): Promise<void>;
// 	set(
// 		id: string,
// 		state: PersistedObjectState,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c)
// 			return this.setPersistent(a, b, c);
// 		return this.setSession(a, b, c);
// 	}

// 	delete(sessionId: string, id: string): Promise<void>;
// 	delete(id: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b: string | OwnerScope): Promise<void> {
// 		if (typeof b === "string") return this.deleteSession(a, b);
// 		return this.deletePersistent(a, b);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<{ target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_GET_OBJECT_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		return row ? row.target_id : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_OBJECT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_OBJECT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ alias_name: string; target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_OBJECT_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<ObjectState, "objectId"> & { objectId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const id =
// 			state.objectId ||
// 			`obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: ObjectState = { ...state, objectId: id };
// 		await this.set(sessionId, id, fullState);
// 		if (alias) await this.setAlias(sessionId, alias, id);
// 		return id;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		id: string,
// 	): Promise<ObjectState | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_OBJECT_SESSION!.sql,
// 			[sessionId, id],
// 		);
// 		if (!row) return null;
// 		return this.loadState(row);
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		id: string,
// 		state: ObjectState,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_OBJECT_SESSION!.sql, [
// 			id,
// 			state.schemaName,
// 			state.parentObjectId || null,
// 			sessionId,
// 			JSON.stringify(state.data),
// 			state.createdAt,
// 			state.schema_pinned_at || null,
// 		]);
// 	}

// 	private async deleteSession(sessionId: string, id: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_OBJECT_SESSION!.sql, [
// 			sessionId,
// 			id,
// 		]);
// 	}

// 	private loadState(row: any): ObjectState {
// 		return {
// 			objectId: row.object_id,
// 			schemaName: row.schema_name,
// 			parentObjectId: row.parent_object_id,
// 			data: JSON.parse(row.data),
// 			createdAt: row.created_at,
// 			schema_pinned_at: row.schema_pinned_at || undefined,
// 			linearDepth: row.linear_depth || undefined,
// 			gcLock: row.gc_lock === 1,
// 		};
// 	}

// 	private async getPersistent(
// 		id: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedObjectState | null> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const saved = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_OBJECT!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		if (!saved) return null;
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_OBJECT_PERSISTENT!.sql,
// 			[id, scope.level, scopeId],
// 		);
// 		if (!row) return null;
// 		return {
// 			...this.loadState(row),
// 			tags: JSON.parse(saved.tags),
// 			description: saved.description,
// 			schema_pinned_at: row.schema_pinned_at || "",
// 		};
// 	}

// 	private async setPersistent(
// 		id: string,
// 		state: PersistedObjectState,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		await this.db.exec(
// 			SCHEMA.sqlite.inserts.SQL_UPSERT_OBJECT_PERSISTENT!.sql,
// 			[
// 				id,
// 				state.schemaName,
// 				state.parentObjectId || null,
// 				scope.level,
// 				scopeId,
// 				JSON.stringify(state.data),
// 				state.createdAt,
// 				state.schema_pinned_at || "",
// 			],
// 		);
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_OBJECT!.sql, [
// 			id,
// 			JSON.stringify(state.tags),
// 			state.description,
// 			scope.level,
// 			scopeId,
// 		]);
// 	}

// 	private async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_SAVED_OBJECT!.sql, [
// 			id,
// 		]);
// 		await this.db.exec(
// 			SCHEMA.sqlite.deletes.SQL_DELETE_OBJECT_PERSISTENT!.sql,
// 			[id, scope.level],
// 		);
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ object_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_OBJECTS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => r.object_id);
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ object_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_OBJECTS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		return rows.map((r) => r.object_id);
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		await this.ensureInit();
// 		if (olderThanMs !== undefined) {
// 			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
// 			await this.db.exec(
// 				SCHEMA.sqlite.selects.SQL_EXPIRE_OBJECTS_SESSION_AGE!.sql,
// 				[sessionId, olderThanDate],
// 			);
// 		} else {
// 			await this.db.exec(
// 				SCHEMA.sqlite.selects.SQL_EXPIRE_OBJECTS_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedObjectState[]> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const allSaved = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_OBJECTS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const results: PersistedObjectState[] = [];
// 		for (const saved of allSaved) {
// 			const tags: string[] = JSON.parse(saved.tags);
// 			if (tags.includes(tag)) {
// 				const fullState = await this.getPersistent(saved.id, scope);
// 				if (fullState) results.push(fullState);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
// 		await this.ensureInit();
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		let queryStr =
// 			"SELECT id, scope_level, user_id FROM saved_objects WHERE (scope_level = 'global')";
// 		const params: any[] = [];
// 		if (scope.level === "user") {
// 			if (includeGlobal) {
// 				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
// 				params.push(userId);
// 			} else {
// 				queryStr =
// 					"SELECT id, scope_level, user_id FROM saved_objects WHERE scope_level = 'user' AND user_id = ?";
// 				params.push(userId);
// 			}
// 		}
// 		const savedRecords = await this.db.query<any>(queryStr, params);
// 		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: r.user_id }
// 					: { level: "global" };
// 			const state = await this.getPersistent(r.id, recordScope);
// 			if (state) results.push({ ...state, scope: recordScope });
// 		}
// 		return results;
// 	}
// }

// // ── OPFS Event Store ──────────────────────────────────────────────────────────

// export class OpfsEventStore implements SessionEventStore, PersistentEventStore {
// 	private db: OpfsDb;
// 	private initDone = false;

// 	constructor(db: OpfsDb) {
// 		this.db = db;
// 	}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(SCHEMA.sqlite.pragma);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_EVENTS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_SAVED_EVENTS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_EVENT_SESSION_ALIASES!.sql);
// 		this.initDone = true;
// 	}

// 	get(sessionId: string, commitId: string): Promise<EventCommit | null>;
// 	get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") return this.getSession(a, b);
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, commitId: string, state: EventCommit): Promise<void>;
// 	set(
// 		commitId: string,
// 		state: PersistedEventState,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c)
// 			return this.setPersistent(a, b, c);
// 		return this.setSession(a, b, c);
// 	}

// 	delete(sessionId: string, commitId: string): Promise<void>;
// 	delete(commitId: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b: string | OwnerScope): Promise<void> {
// 		if (typeof b === "string") return this.deleteSession(a, b);
// 		return this.deletePersistent(a, b);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<{ target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_GET_EVENT_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		return row ? row.target_id : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_EVENT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_EVENT_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ alias_name: string; target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_EVENT_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<EventCommit, "commitId"> & { commitId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const commitId =
// 			state.commitId ||
// 			`commit_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: EventCommit = { ...state, commitId };
// 		await this.set(sessionId, commitId, fullState);
// 		if (alias) await this.setAlias(sessionId, alias, commitId);
// 		return commitId;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		commitId: string,
// 	): Promise<EventCommit | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_EVENT_SESSION!.sql,
// 			[sessionId, commitId],
// 		);
// 		if (!row) return null;
// 		return this.loadState(row);
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		commitId: string,
// 		state: EventCommit,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_EVENT_SESSION!.sql, [
// 			commitId,
// 			sessionId,
// 			state.parentCommitId || null,
// 			state.operation,
// 			JSON.stringify(state.mutations),
// 			state.createdAt,
// 			state.linearDepth || 0,
// 			state.gcLock ? 1 : 0,
// 			state.mergeSourceCommitIds
// 				? JSON.stringify(state.mergeSourceCommitIds)
// 				: null,
// 			state.mergeAcceptedIds ? JSON.stringify(state.mergeAcceptedIds) : null,
// 			state.mergeRejectedIds ? JSON.stringify(state.mergeRejectedIds) : null,
// 		]);
// 	}

// 	private async deleteSession(
// 		sessionId: string,
// 		commitId: string,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_EVENT_SESSION!.sql, [
// 			sessionId,
// 			commitId,
// 		]);
// 	}

// 	private loadState(row: any): EventCommit {
// 		return {
// 			commitId: row.commit_id,
// 			sessionId: row.session_id,
// 			parentCommitId: row.parent_commit_id,
// 			createdAt: row.created_at,
// 			operation: row.operation,
// 			mutations: JSON.parse(row.mutations),
// 			linearDepth: row.linear_depth || 0,
// 			gcLock: row.gc_lock === 1,
// 			mergeSourceCommitIds: row.merge_source_commit_ids
// 				? JSON.parse(row.merge_source_commit_ids)
// 				: undefined,
// 			mergeAcceptedIds: row.merge_accepted_ids
// 				? JSON.parse(row.merge_accepted_ids)
// 				: undefined,
// 			mergeRejectedIds: row.merge_rejected_ids
// 				? JSON.parse(row.merge_rejected_ids)
// 				: undefined,
// 		};
// 	}

// 	private async getPersistent(
// 		commitId: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedEventState | null> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const saved = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_EVENT!.sql,
// 			[commitId, scope.level, scopeId],
// 		);
// 		if (!saved) return null;
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_EVENT_PERSISTENT!.sql,
// 			[commitId, scope.level, scopeId],
// 		);
// 		if (!row) return null;
// 		return {
// 			...this.loadState(row),
// 			tags: JSON.parse(saved.tags),
// 			description: saved.description,
// 			schema_name: row.schema_name,
// 		};
// 	}

// 	private async setPersistent(
// 		commitId: string,
// 		state: PersistedEventState,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_EVENT_PERSISTENT!.sql, [
// 			commitId,
// 			scope.level,
// 			scopeId,
// 			state.parentCommitId || null,
// 			state.operation,
// 			JSON.stringify(state.mutations),
// 			state.createdAt,
// 			state.linearDepth || 0,
// 			state.gcLock ? 1 : 0,
// 			state.mergeSourceCommitIds
// 				? JSON.stringify(state.mergeSourceCommitIds)
// 				: null,
// 			state.mergeAcceptedIds ? JSON.stringify(state.mergeAcceptedIds) : null,
// 			state.mergeRejectedIds ? JSON.stringify(state.mergeRejectedIds) : null,
// 			state.schema_name,
// 		]);
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_EVENT!.sql, [
// 			commitId,
// 			JSON.stringify(state.tags),
// 			state.description,
// 			scope.level,
// 			scopeId,
// 		]);
// 	}

// 	private async deletePersistent(
// 		commitId: string,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_SAVED_EVENT!.sql, [
// 			commitId,
// 		]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_EVENT_PERSISTENT!.sql, [
// 			commitId,
// 			scope.level,
// 		]);
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ commit_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_EVENTS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => r.commit_id);
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ commit_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_EVENTS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		return rows.map((r) => r.commit_id);
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		await this.ensureInit();
// 		if (olderThanMs !== undefined) {
// 			const olderThanDate = new Date(Date.now() - olderThanMs).toISOString();
// 			await this.db.exec(
// 				SCHEMA.sqlite.selects.SQL_EXPIRE_EVENTS_SESSION_AGE!.sql,
// 				[sessionId, olderThanDate],
// 			);
// 		} else {
// 			await this.db.exec(SCHEMA.sqlite.selects.SQL_EXPIRE_EVENTS_SESSION!.sql, [
// 				sessionId,
// 			]);
// 		}
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedEventState[]> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		const allSaved = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_EVENTS_BY_SCOPE!.sql,
// 			[scope.level, scopeId],
// 		);
// 		const results: PersistedEventState[] = [];
// 		for (const saved of allSaved) {
// 			const tags: string[] = JSON.parse(saved.tags);
// 			if (tags.includes(tag)) {
// 				const fullState = await this.getPersistent(saved.id, scope);
// 				if (fullState) results.push(fullState);
// 			}
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
// 		await this.ensureInit();
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		let queryStr =
// 			"SELECT id, scope_level, user_id FROM saved_events WHERE (scope_level = 'global')";
// 		const params: any[] = [];
// 		if (scope.level === "user") {
// 			if (includeGlobal) {
// 				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
// 				params.push(userId);
// 			} else {
// 				queryStr =
// 					"SELECT id, scope_level, user_id FROM saved_events WHERE scope_level = 'user' AND user_id = ?";
// 				params.push(userId);
// 			}
// 		}
// 		const savedRecords = await this.db.query<any>(queryStr, params);
// 		const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: r.user_id }
// 					: { level: "global" };
// 			const state = await this.getPersistent(r.id, recordScope);
// 			if (state) results.push({ ...state, scope: recordScope });
// 		}
// 		return results;
// 	}
// }

// // ── OPFS Form Store ───────────────────────────────────────────────────────────

// export class OpfsFormStore implements SessionFormStore, PersistentFormStore {
// 	private db: OpfsDb;
// 	private initDone = false;

// 	constructor(db: OpfsDb) {
// 		this.db = db;
// 	}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(SCHEMA.sqlite.pragma);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FORMS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FORM_ANSWERS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FORM_SKIPPED!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FORM_STALE!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_SAVED_FORMS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_FORM_SESSION_ALIASES!.sql);
// 		this.initDone = true;
// 	}

// 	get(sessionId: string, id: string): Promise<FormState | null>;
// 	get(id: string, scope: OwnerScope): Promise<PersistedFormStateDetails | null>;
// 	async get(a: string, b: string | OwnerScope): Promise<any> {
// 		if (typeof b === "string") return this.getSession(a, b);
// 		return this.getPersistent(a, b);
// 	}

// 	set(sessionId: string, id: string, state: FormState): Promise<void>;
// 	set(
// 		id: string,
// 		state: PersistedFormStateDetails,
// 		scope: OwnerScope,
// 	): Promise<void>;
// 	async set(a: string, b: any, c?: any): Promise<void> {
// 		if (c && typeof c === "object" && "level" in c)
// 			return this.setPersistent(a, b, c);
// 		return this.setSession(a, b, c);
// 	}

// 	async delete(sessionId: string, id: string): Promise<void>;
// 	async delete(id: string, scope: OwnerScope): Promise<void>;
// 	async delete(a: string, b?: any): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_ANSWERS!.sql, [a]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_SKIPPED!.sql, [a]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_STALE!.sql, [a]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM!.sql, [a]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_SAVED_FORM!.sql, [a]);
// 	}

// 	async getAlias(sessionId: string, alias: string): Promise<string | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<{ target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_GET_FORM_ALIAS!.sql,
// 			[sessionId, alias],
// 		);
// 		return row ? row.target_id : null;
// 	}

// 	async setAlias(
// 		sessionId: string,
// 		alias: string,
// 		targetId: string,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_FORM_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 			targetId,
// 		]);
// 	}

// 	async deleteAlias(sessionId: string, alias: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_ALIAS!.sql, [
// 			sessionId,
// 			alias,
// 		]);
// 	}

// 	async listAliases(
// 		sessionId: string,
// 	): Promise<Array<{ alias: string; targetId: string }>> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ alias_name: string; target_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_FORM_ALIASES!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => ({ alias: r.alias_name, targetId: r.target_id }));
// 	}

// 	async create(
// 		sessionId: string,
// 		state: Omit<FormState, "formId"> & { formId?: string },
// 		alias?: string,
// 	): Promise<string> {
// 		const id =
// 			state.formId ||
// 			`form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
// 		const fullState: FormState = { ...state, formId: id };
// 		await this.set(sessionId, id, fullState);
// 		if (alias) await this.setAlias(sessionId, alias, id);
// 		return id;
// 	}

// 	private async getSession(
// 		sessionId: string,
// 		id: string,
// 	): Promise<FormState | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FORM_SESSION!.sql,
// 			[id, sessionId],
// 		);
// 		if (!row) return null;
// 		return this.loadState(row);
// 	}

// 	private async getPersistent(
// 		id: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFormStateDetails | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FORM_PERSISTENT!.sql,
// 			[id, scope.level],
// 		);
// 		if (!row) return null;
// 		const saved = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_SAVED_FORM!.sql,
// 			[id],
// 		);
// 		const tags = saved ? JSON.parse(saved.tags) : [];
// 		const description = saved ? saved.description : "";
// 		const state = await this.loadState(row);
// 		return { ...state, tags, description, schema_pinned_at: row.created_at };
// 	}

// 	private async loadState(row: any): Promise<FormState> {
// 		const formId = row.form_id;
// 		const answersRows = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FORM_ANSWERS!.sql,
// 			[formId],
// 		);
// 		const skippedRows = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FORM_SKIPPED!.sql,
// 			[formId],
// 		);
// 		const staleRows = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_FORM_STALE!.sql,
// 			[formId],
// 		);

// 		const answers: Record<string, any> = {};
// 		for (const r of answersRows) answers[r.question_id] = JSON.parse(r.value);
// 		const skipped = skippedRows.map((r: any) => r.question_id);
// 		const stale: Record<string, boolean> = {};
// 		for (const r of staleRows) stale[r.question_id] = true;

// 		return {
// 			formId,
// 			parentFormId: row.parent_form_id,
// 			schemaName: row.schema_name,
// 			answers,
// 			skipped,
// 			stale,
// 			timestamp: row.created_at,
// 		};
// 	}

// 	private async setSession(
// 		sessionId: string,
// 		id: string,
// 		state: FormState,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_FORM_SESSION!.sql, [
// 			id,
// 			state.parentFormId,
// 			state.schemaName,
// 			sessionId,
// 			state.timestamp,
// 		]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_ANSWERS!.sql, [
// 			id,
// 		]);
// 		for (const [qId, val] of Object.entries(state.answers))
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FORM_ANSWER!.sql, [
// 				id,
// 				qId,
// 				JSON.stringify(val),
// 			]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_SKIPPED!.sql, [
// 			id,
// 		]);
// 		for (const qId of state.skipped)
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FORM_SKIPPED!.sql, [
// 				id,
// 				qId,
// 			]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_STALE!.sql, [id]);
// 		for (const qId of Object.keys(state.stale))
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FORM_STALE!.sql, [
// 				id,
// 				qId,
// 			]);
// 	}

// 	private async setPersistent(
// 		id: string,
// 		state: PersistedFormStateDetails,
// 		scope: OwnerScope,
// 	): Promise<void> {
// 		await this.ensureInit();
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_FORM_PERSISTENT!.sql, [
// 			id,
// 			state.parentFormId,
// 			state.schemaName,
// 			scope.level,
// 			userId,
// 			state.timestamp,
// 		]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_ANSWERS!.sql, [
// 			id,
// 		]);
// 		for (const [qId, val] of Object.entries(state.answers))
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FORM_ANSWER!.sql, [
// 				id,
// 				qId,
// 				JSON.stringify(val),
// 			]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_SKIPPED!.sql, [
// 			id,
// 		]);
// 		for (const qId of state.skipped)
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FORM_SKIPPED!.sql, [
// 				id,
// 				qId,
// 			]);
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_FORM_STALE!.sql, [id]);
// 		for (const qId of Object.keys(state.stale))
// 			await this.db.exec(SCHEMA.sqlite.inserts.SQL_INSERT_FORM_STALE!.sql, [
// 				id,
// 				qId,
// 			]);
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_FORM!.sql, [
// 			id,
// 			JSON.stringify(state.tags),
// 			state.description,
// 			scope.level,
// 			userId,
// 			state.timestamp,
// 		]);
// 	}

// 	async listSession(sessionId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ form_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_FORMS_SESSION!.sql,
// 			[sessionId],
// 		);
// 		return rows.map((r) => r.form_id);
// 	}

// 	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ form_id: string }>(
// 			SCHEMA.sqlite.selects.SQL_LIST_FORMS_CHILDREN!.sql,
// 			[sessionId, parentId],
// 		);
// 		return rows.map((r) => r.form_id);
// 	}

// 	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
// 		await this.ensureInit();
// 		if (olderThanMs !== undefined) {
// 			await this.db.exec(
// 				SCHEMA.sqlite.selects.SQL_EXPIRE_FORMS_BY_SESSION_AGE!.sql,
// 				[sessionId, new Date(Date.now() - olderThanMs).toISOString()],
// 			);
// 		} else {
// 			await this.db.exec(
// 				SCHEMA.sqlite.selects.SQL_EXPIRE_FORMS_BY_SESSION!.sql,
// 				[sessionId],
// 			);
// 		}
// 	}

// 	async findByTag(
// 		tag: string,
// 		scope: OwnerScope,
// 	): Promise<PersistedFormStateDetails[]> {
// 		await this.ensureInit();
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		const query =
// 			scope.level === "user"
// 				? "SELECT id FROM saved_forms WHERE scope_level = 'user' AND user_id = ? AND tags LIKE ?"
// 				: "SELECT id FROM saved_forms WHERE scope_level = 'global' AND tags LIKE ?";
// 		const params = scope.level === "user" ? [userId, `%${tag}%`] : [`%${tag}%`];
// 		const rows = await this.db.query<{ id: string }>(query, params);
// 		const results: PersistedFormStateDetails[] = [];
// 		for (const r of rows) {
// 			const state = await this.getPersistent(r.id, scope);
// 			if (state) results.push(state);
// 		}
// 		return results;
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
// 		await this.ensureInit();
// 		const userId = scope.level === "user" ? scope.userId : null;
// 		let queryStr =
// 			"SELECT id, scope_level, user_id FROM saved_forms WHERE (scope_level = 'global')";
// 		const params: any[] = [];
// 		if (scope.level === "user") {
// 			if (includeGlobal) {
// 				queryStr += " OR (scope_level = 'user' AND user_id = ?)";
// 				params.push(userId);
// 			} else {
// 				queryStr =
// 					"SELECT id, scope_level, user_id FROM saved_forms WHERE scope_level = 'user' AND user_id = ?";
// 				params.push(userId);
// 			}
// 		}
// 		const savedRecords = await this.db.query<any>(queryStr, params);
// 		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> =
// 			[];
// 		for (const r of savedRecords) {
// 			const recordScope: OwnerScope =
// 				r.scope_level === "user"
// 					? { level: "user", userId: r.user_id }
// 					: { level: "global" };
// 			const state = await this.getPersistent(r.id, recordScope);
// 			if (state) results.push({ ...state, scope: recordScope });
// 		}
// 		return results;
// 	}
// }

// // ── OPFS Concept Store ────────────────────────────────────────────────────────

// export class OpfsConceptStore implements ConceptStore {
// 	private db: OpfsDb;
// 	private initDone = false;

// 	constructor(db: OpfsDb) {
// 		this.db = db;
// 	}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_DICT_NAMESPACES!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_DICT_CONCEPTS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_DICT_RELATIONS!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddlIndexes.IDX_CONCEPT_REL_FORWARD!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddlIndexes.IDX_CONCEPT_REL_REVERSE!.sql);
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_DICT_RELATION_CACHE!.sql);
// 		await this.db.exec(
// 			SCHEMA.sqlite.ddlIndexes.IDX_CONCEPT_CACHE_TRAVERSAL!.sql,
// 		);
// 		this.initDone = true;
// 	}

// 	async search(
// 		query: string,
// 		namespaceCode?: string,
// 		limit = 50,
// 	): Promise<Concept[]> {
// 		await this.ensureInit();
// 		let sql =
// 			"SELECT * FROM dict_concepts WHERE (display LIKE ? OR id = ? OR standard_code = ? OR description LIKE ?)";
// 		const params: any[] = [`%${query}%`, query, query, `%${query}%`];
// 		if (namespaceCode) {
// 			sql += " AND namespace_code = ?";
// 			params.push(namespaceCode);
// 		}
// 		sql += " LIMIT ?";
// 		params.push(limit);
// 		const rows = await this.db.query<any>(sql, params);
// 		return rows.map((r) => ({
// 			id: r.id,
// 			namespaceCode: r.namespace_code,
// 			standardCode: r.standard_code,
// 			display: r.display,
// 			description: r.description || undefined,
// 			designationDate: r.designation_date || undefined,
// 			active: r.active === 1,
// 		}));
// 	}

// 	async getById(id: string): Promise<Concept | null> {
// 		await this.ensureInit();
// 		const r = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_DICT_CONCEPT_BY_ID!.sql,
// 			[id],
// 		);
// 		if (!r) return null;
// 		return {
// 			id: r.id,
// 			namespaceCode: r.namespace_code,
// 			standardCode: r.standard_code,
// 			display: r.display,
// 			description: r.description || undefined,
// 			designationDate: r.designation_date || undefined,
// 			active: r.active === 1,
// 		};
// 	}

// 	async listNamespaces(): Promise<Namespace[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_DICT_NAMESPACES!.sql,
// 		);
// 		return rows.map((r) => ({
// 			code: r.code,
// 			description: r.description || undefined,
// 			isPublic: r.is_public === 1,
// 			isExternalPrivate: r.is_external_private === 1,
// 			isMutable: r.is_mutable === 1,
// 		}));
// 	}

// 	async addConcept(concept: Concept): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_CONCEPT!.sql, [
// 			concept.id,
// 			concept.namespaceCode,
// 			concept.standardCode,
// 			concept.display,
// 			concept.description || null,
// 			concept.designationDate || null,
// 			concept.active !== false ? 1 : 0,
// 		]);
// 	}

// 	async addNamespace(namespace: Namespace): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_NAMESPACE!.sql, [
// 			namespace.code,
// 			namespace.description || null,
// 			namespace.isPublic ? 1 : 0,
// 			namespace.isExternalPrivate ? 1 : 0,
// 			namespace.isMutable !== false ? 1 : 0,
// 		]);
// 	}

// 	async addRelation(relation: ConceptRelation): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_RELATION!.sql, [
// 			relation.id,
// 			relation.conceptId,
// 			relation.linkedId,
// 			relation.relationshipType,
// 			relation.active !== false ? 1 : 0,
// 			relation.designationDate || null,
// 		]);
// 		await this.invalidateRelationCache(relation.conceptId);
// 		await this.invalidateRelationCache(relation.linkedId);
// 	}

// 	async invalidateRelationCache(conceptId?: string): Promise<void> {
// 		await this.ensureInit();
// 		if (conceptId) {
// 			await this.db.exec(
// 				SCHEMA.sqlite.deletes.SQL_DELETE_DICT_RELATION_CACHE_FOR!.sql,
// 				[conceptId, conceptId],
// 			);
// 		} else {
// 			await this.db.exec(
// 				SCHEMA.sqlite.deletes.SQL_DELETE_DICT_RELATION_CACHE!.sql,
// 			);
// 		}
// 	}

// 	async getRelations(
// 		conceptId: string,
// 		direction: TraversalDirection = "both",
// 	): Promise<ConceptRelation[]> {
// 		await this.ensureInit();
// 		const sqlParts: string[] = [];
// 		const params: any[] = [];
// 		if (direction === "forward" || direction === "both") {
// 			sqlParts.push(
// 				SCHEMA.sqlite.selects.SQL_SELECT_DICT_RELATIONS_FORWARD!.sql,
// 			);
// 			params.push(conceptId);
// 		}
// 		if (direction === "reverse" || direction === "both") {
// 			sqlParts.push(
// 				SCHEMA.sqlite.selects.SQL_SELECT_DICT_RELATIONS_REVERSE!.sql,
// 			);
// 			params.push(conceptId);
// 		}
// 		if (sqlParts.length === 0) return [];
// 		const rows = await this.db.query<any>(sqlParts.join(" UNION ALL "), params);
// 		return rows.map((r) => ({
// 			id: r.id,
// 			conceptId: r.concept_id,
// 			linkedId: r.linked_id,
// 			relationshipType: r.relationship_type,
// 			active: r.active === 1,
// 			designationDate: r.designation_date || undefined,
// 		}));
// 	}

// 	async getRelatedConcepts(
// 		conceptId: string,
// 		direction: TraversalDirection = "both",
// 		maxDepth = 3,
// 		useCache = true,
// 	): Promise<RelatedConceptResult[]> {
// 		await this.ensureInit();
// 		if (useCache) {
// 			const cached = await this.db.query<any>(
// 				SCHEMA.sqlite.selects.SQL_SELECT_DICT_CACHE_RELATED!.sql,
// 				[conceptId, maxDepth],
// 			);
// 			if (cached.length > 0) {
// 				return cached.map((r: any) => ({
// 					concept: {
// 						id: r.id,
// 						namespaceCode: r.namespace_code,
// 						standardCode: r.standard_code,
// 						display: r.display,
// 						description: r.description || undefined,
// 						designationDate: r.designation_date || undefined,
// 						active: r.active === 1,
// 					},
// 					relationshipType: r.inferred_relationship_type,
// 					direction: "forward" as const,
// 					depth: r.link_depth,
// 				}));
// 			}
// 		}

// 		const rows = await this.db.query<any>(
// 			SCHEMA.sqlite.raw.CTE_DICT_RELATED_CONCEPTS!,
// 			[
// 				conceptId,
// 				direction,
// 				direction,
// 				conceptId,
// 				direction,
// 				direction,
// 				maxDepth,
// 				maxDepth,
// 			],
// 		);
// 		const results: RelatedConceptResult[] = rows.map((r: any) => ({
// 			concept: {
// 				id: r.id,
// 				namespaceCode: r.namespace_code,
// 				standardCode: r.standard_code,
// 				display: r.display,
// 				description: r.description || undefined,
// 				designationDate: r.designation_date || undefined,
// 				active: r.active === 1,
// 			},
// 			relationshipType: r.relationship_type,
// 			direction: r.dir,
// 			depth: r.depth,
// 		}));

// 		if (useCache && results.length > 0) {
// 			const now = new Date().toISOString();
// 			for (const res of results) {
// 				await this.db.exec(
// 					SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_RELATION_CACHE!.sql,
// 					[conceptId, res.concept.id, res.depth, res.relationshipType, now],
// 				);
// 			}
// 		}
// 		return results;
// 	}
// }

// // ── OPFS Persistent Expression Store ──────────────────────────────────────────

// export class OpfsPersistentExpressionStore
// 	implements PersistentExpressionStore
// {
// 	private db: OpfsDb;
// 	private initDone = false;

// 	constructor(db: OpfsDb) {
// 		this.db = db;
// 	}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(SCHEMA.sqlite.ddl.DDL_DICT_CUSTOM_EXPRESSIONS!.sql);
// 		this.initDone = true;
// 	}

// 	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		await this.db.exec(SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_EXPRESSION!.sql, [
// 			expression.id,
// 			expression.term,
// 			expression.conceptId || null,
// 			scope.level,
// 			scopeId,
// 			JSON.stringify(expression),
// 		]);
// 	}

// 	async delete(id: string, scope: OwnerScope): Promise<void> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		await this.db.exec(SCHEMA.sqlite.deletes.SQL_DELETE_DICT_EXPRESSION!.sql, [
// 			id,
// 			scope.level,
// 			scopeId,
// 		]);
// 	}

// 	async list(
// 		scope: OwnerScope,
// 		includeGlobal?: boolean,
// 	): Promise<CustomExpression[]> {
// 		await this.ensureInit();
// 		const scopeId = scope.level === "user" ? scope.userId : null;
// 		let sql =
// 			"SELECT * FROM dict_custom_expressions WHERE (scope_level = ? AND (scope_id = ? OR scope_id IS NULL))";
// 		const params: any[] = [scope.level, scopeId];
// 		if (includeGlobal && scope.level !== "global")
// 			sql += " OR scope_level = 'global'";
// 		const rows = await this.db.query<any>(sql, params);
// 		return rows.map((r) => JSON.parse(r.data));
// 	}

// 	async getById(id: string): Promise<CustomExpression | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<any>(
// 			SCHEMA.sqlite.selects.SQL_SELECT_DICT_EXPRESSION_DATA!.sql,
// 			[id],
// 		);
// 		return row ? JSON.parse(row.data) : null;
// 	}
// }

// // Register opfs-sqlite adapter factory
// registerAdapter("opfs-sqlite", {
// 	async create(options: Record<string, unknown>) {
// 		const dbName = (options.dbName as string) || "stateful_mcp_opfs.sqlite3";
// 		const workerUrl = options.workerUrl as string | undefined;
// 		const db = new OpfsDb(dbName, workerUrl);
// 		await db.open();
// 		return {
// 			sessionFilter: new OpfsFilterStore(db),
// 			persistentFilter: new OpfsFilterStore(db),
// 			sessionObject: new OpfsObjectStore(db),
// 			persistentObject: new OpfsObjectStore(db),
// 			sessionEvent: new OpfsEventStore(db),
// 			persistentEvent: new OpfsEventStore(db),
// 			sessionForm: new OpfsFormStore(db),
// 			persistentForm: new OpfsFormStore(db),
// 			conceptStore: new OpfsConceptStore(db),
// 			persistentExpressionStore: new OpfsPersistentExpressionStore(db),
// 		};
// 	},
// });
