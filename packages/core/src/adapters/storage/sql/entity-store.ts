import * as crypto from "crypto";
import type { QueryCondition } from "../../../translation/sql-compiler";
import type { SqlBackend, SqlStatement } from "./backend";
import type { EntityConfig } from "./entity-config";

export class GenericSqlEntityStore<Session, Persistent> {
	constructor(
		private backend: SqlBackend,
		private config: EntityConfig<Session, Persistent>,
	) {}

	private newId(): string {
		return `${this.config.idPrefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
	}

	async create(sessionId: string, state: any, alias?: string): Promise<string> {
		const id = this.newId();
		const fullState = { ...state, [this.config.idField]: id };
		await this.setSession(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async getSession(sessionId: string, id: string): Promise<Session | null> {
		const sel = this.backend.compiler.compileSelect({
			table: this.config.sessionTable,
			where: [
				{ column: "session_id", op: "eq", value: sessionId },
				{ column: this.config.idField, op: "eq", value: id },
				{ column: "scope_level", op: "eq", raw: "'session'" },
			],
		});
		const row = await this.backend.queryOne(sel.sql, sel.params);
		if (!row) return null;
		return this.assembleSession(row);
	}

	async setSession(
		sessionId: string,
		id: string,
		state: Session,
	): Promise<void> {
		const rowValues = this.config.sessionToRow(id, sessionId, state);
		const upsert = this.backend.compiler.compileReplace({
			table: this.config.sessionTable,
			values: rowValues as Record<string, any>,
			conflictColumns: [this.config.idField],
		});
		const statements: SqlStatement[] = [
			{ sql: upsert.sql, params: upsert.params },
		];
		this.appendChildDeletesAndInserts(statements, id, state);
		await this.backend.transaction(statements);
	}

	async deleteSession(sessionId: string, id: string): Promise<void> {
		const statements: SqlStatement[] = [];
		this.appendChildDeletesById(statements, id);
		const del = this.backend.compiler.compileDelete({
			table: this.config.sessionTable,
			where: [
				{ column: "session_id", op: "eq", value: sessionId },
				{ column: this.config.idField, op: "eq", value: id },
				{ column: "scope_level", op: "eq", raw: "'session'" },
			],
		});
		statements.push({ sql: del.sql, params: del.params });
		await this.backend.transaction(statements);
	}

	async listSession(sessionId: string): Promise<string[]> {
		const sel = this.backend.compiler.compileSelect({
			table: this.config.sessionTable,
			select: [{ column: this.config.idField }],
			where: [
				{ column: "session_id", op: "eq", value: sessionId },
				{ column: "scope_level", op: "eq", raw: "'session'" },
			],
		});
		const rows = await this.backend.query(sel.sql, sel.params);
		return rows.map((r) => String(r[this.config.idField]));
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		if (!this.config.parentIdColumn) return [];
		const sel = this.backend.compiler.compileSelect({
			table: this.config.sessionTable,
			select: [{ column: this.config.idField }],
			where: [
				{ column: "session_id", op: "eq", value: sessionId },
				{ column: this.config.parentIdColumn, op: "eq", value: parentId },
				{ column: "scope_level", op: "eq", raw: "'session'" },
			],
		});
		const rows = await this.backend.query(sel.sql, sel.params);
		return rows.map((r) => String(r[this.config.idField]));
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		if (olderThanMs !== undefined) {
			const cutoff = new Date(Date.now() - olderThanMs).toISOString();
			const findSel = this.backend.compiler.compileSelect({
				table: this.config.sessionTable,
				select: [{ column: this.config.idField }],
				where: [
					{ column: "session_id", op: "eq", value: sessionId },
					{ column: "scope_level", op: "eq", raw: "'session'" },
					{ column: "created_at", op: "lt", value: cutoff },
				],
			});
			const rows = await this.backend.query(findSel.sql, findSel.params);
			const ids = rows.map((r) => String(r[this.config.idField]));
			if (ids.length === 0) return;
			const statements: SqlStatement[] = [];
			for (const child of this.config.children ?? []) {
				const del = this.backend.compiler.compileDelete({
					table: child.table,
					where: [{ column: child.parentIdColumn, op: "in_set", values: ids }],
				});
				statements.push({ sql: del.sql, params: del.params });
			}
			const del = this.backend.compiler.compileDelete({
				table: this.config.sessionTable,
				where: [
					{ column: this.config.idField, op: "in_set", values: ids },
					{ column: "scope_level", op: "eq", raw: "'session'" },
				],
			});
			statements.push({ sql: del.sql, params: del.params });
			await this.backend.transaction(statements);
		} else {
			const statements: SqlStatement[] = [];
			for (const child of this.config.children ?? []) {
				const ph = this.backend.dialect === "postgres" ? "$1" : "?";
				const del = this.backend.compiler.compileDelete({
					table: child.table,
					where: [
						{
							column: child.parentIdColumn,
							op: "in_set",
							raw: `(SELECT ${this.config.idField} FROM ${this.config.sessionTable} WHERE session_id = ${ph} AND scope_level = 'session')`,
						},
					],
				});
				statements.push({ sql: del.sql, params: [sessionId] });
			}
			const del = this.backend.compiler.compileDelete({
				table: this.config.sessionTable,
				where: [
					{ column: "session_id", op: "eq", value: sessionId },
					{ column: "scope_level", op: "eq", raw: "'session'" },
				],
			});
			statements.push({ sql: del.sql, params: del.params });
			await this.backend.transaction(statements);
		}
	}

	async getPersistent(
		id: string,
		scope: { level: string; userId?: string | null },
	): Promise<Persistent | null> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		const scopeConditions = this.scopeConditions(scope);
		const savedSel = this.backend.compiler.compileSelect({
			table: this.config.savedTable,
			where: [{ column: "id", op: "eq", value: id }, ...scopeConditions],
		});
		const savedRow = await this.backend.queryOne(savedSel.sql, savedSel.params);
		if (!savedRow) return null;

		const sel = this.backend.compiler.compileSelect({
			table: this.config.sessionTable,
			where: [
				{ column: this.config.idField, op: "eq", value: id },
				...scopeConditions,
			],
		});
		const row = await this.backend.queryOne(sel.sql, sel.params);
		if (!row) return null;
		return this.assemblePersistent(row, savedRow);
	}

	async setPersistent(
		id: string,
		state: Persistent,
		scope: { level: string; userId?: string | null },
	): Promise<void> {
		const rowValues = this.config.persistentToRow(id, scope, state);
		const upsert = this.backend.compiler.compileReplace({
			table: this.config.sessionTable,
			values: rowValues as Record<string, any>,
			conflictColumns: [this.config.idField],
		});
		const statements: SqlStatement[] = [
			{ sql: upsert.sql, params: upsert.params },
		];

		this.appendChildDeletesAndInserts(statements, id, state);

		const savedValues = this.config.savedToRow(id, scope, state);
		const savedUpsert = this.backend.compiler.compileReplace({
			table: this.config.savedTable,
			values: savedValues as Record<string, any>,
			conflictColumns: ["id"],
		});
		statements.push({ sql: savedUpsert.sql, params: savedUpsert.params });

		await this.backend.transaction(statements);
	}

	async deletePersistent(
		id: string,
		scope: { level: string; userId?: string | null },
	): Promise<void> {
		const statements: SqlStatement[] = [];
		this.appendChildDeletesById(statements, id);

		const delSaved = this.backend.compiler.compileDelete({
			table: this.config.savedTable,
			where: [{ column: "id", op: "eq", value: id }],
		});
		statements.push({ sql: delSaved.sql, params: delSaved.params });

		const del = this.backend.compiler.compileDelete({
			table: this.config.sessionTable,
			where: [
				{ column: this.config.idField, op: "eq", value: id },
				{ column: "scope_level", op: "eq", value: scope.level },
			],
		});
		statements.push({ sql: del.sql, params: del.params });

		await this.backend.transaction(statements);
	}

	async list(
		scope: { level: string; userId?: string | null },
		includeGlobal?: boolean,
	): Promise<
		Array<Persistent & { scope: { level: string; userId?: string } }>
	> {
		const conditions = this.buildScopeConditions(scope, includeGlobal);
		const sel = this.backend.compiler.compileSelect({
			table: this.config.savedTable,
			select: [
				{ column: "id" },
				{ column: "scope_level" },
				{ column: "user_id" },
			],
			where: conditions,
		});
		const rows = await this.backend.query(sel.sql, sel.params);
		const results: Array<
			Persistent & { scope: { level: string; userId?: string } }
		> = [];
		for (const r of rows) {
			const recordScope: { level: string; userId?: string } =
				r.scope_level === "user"
					? { level: "user", userId: String(r.user_id) }
					: { level: "global" };
			const full = await this.getPersistent(String(r.id), recordScope);
			if (full) {
				results.push({ ...full, scope: recordScope });
			}
		}
		return results;
	}

	async findByTag(
		tag: string,
		scope: { level: string; userId?: string | null },
	): Promise<Persistent[]> {
		const conditions = this.buildScopeConditions(scope);
		conditions.push({ column: "tags", op: "json_contains" as any, value: tag });
		const sel = this.backend.compiler.compileSelect({
			table: this.config.savedTable,
			select: [{ column: "id" }],
			where: conditions,
		});
		const rows = await this.backend.query(sel.sql, sel.params);
		const results: Persistent[] = [];
		for (const r of rows) {
			const full = await this.getPersistent(String(r.id), scope);
			if (full) results.push(full);
		}
		return results;
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const sel = this.backend.compiler.compileSelect({
			table: this.config.aliasTable,
			select: [{ column: "target_id" }],
			where: [
				{ column: "session_id", op: "eq", value: sessionId },
				{ column: "alias_name", op: "eq", value: alias },
			],
		});
		const row = await this.backend.queryOne(sel.sql, sel.params);
		return row ? String(row.target_id) : null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		const upsert = this.backend.compiler.compileReplace({
			table: this.config.aliasTable,
			values: {
				session_id: sessionId,
				alias_name: alias,
				target_id: targetId,
			} as Record<string, any>,
			conflictColumns: ["session_id", "alias_name"],
		});
		await this.backend.exec(upsert.sql, upsert.params);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		const del = this.backend.compiler.compileDelete({
			table: this.config.aliasTable,
			where: [
				{ column: "session_id", op: "eq", value: sessionId },
				{ column: "alias_name", op: "eq", value: alias },
			],
		});
		await this.backend.exec(del.sql, del.params);
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const sel = this.backend.compiler.compileSelect({
			table: this.config.aliasTable,
			select: [{ column: "alias_name" }, { column: "target_id" }],
			where: [{ column: "session_id", op: "eq", value: sessionId }],
		});
		const rows = await this.backend.query(sel.sql, sel.params);
		return rows.map((r) => ({
			alias: String(r.alias_name),
			targetId: String(r.target_id),
		}));
	}

	private async assembleSession(row: Record<string, any>): Promise<Session> {
		const state = this.config.rowToSession(row);
		for (const child of this.config.children ?? []) {
			const csel = this.backend.compiler.compileSelect({
				table: child.table,
				where: [
					{
						column: child.parentIdColumn,
						op: "eq",
						value: row[this.config.idField],
					},
				],
				orderBy: child.orderColumn
					? [{ column: child.orderColumn, direction: "ASC" }]
					: undefined,
			});
			const rows = await this.backend.query(csel.sql, csel.params);
			const items = rows.map(child.fromRow);
			(state as any)[child.stateField] = child.toState
				? child.toState(items)
				: items;
		}
		return state;
	}

	private async assemblePersistent(
		row: Record<string, any>,
		savedRow: Record<string, any>,
	): Promise<Persistent> {
		const state = this.config.rowToPersistent(row, savedRow);
		for (const child of this.config.children ?? []) {
			const csel = this.backend.compiler.compileSelect({
				table: child.table,
				where: [
					{
						column: child.parentIdColumn,
						op: "eq",
						value: row[this.config.idField],
					},
				],
				orderBy: child.orderColumn
					? [{ column: child.orderColumn, direction: "ASC" }]
					: undefined,
			});
			const rows = await this.backend.query(csel.sql, csel.params);
			const items = rows.map(child.fromRow);
			(state as any)[child.stateField] = child.toState
				? child.toState(items)
				: items;
		}
		return state;
	}

	private appendChildDeletesAndInserts(
		statements: SqlStatement[],
		parentId: string,
		state: any,
	): void {
		for (const child of this.config.children ?? []) {
			const del = this.backend.compiler.compileDelete({
				table: child.table,
				where: [{ column: child.parentIdColumn, op: "eq", value: parentId }],
			});
			statements.push({ sql: del.sql, params: del.params });

			const rawItems = (state as any)[child.stateField] ?? [];
			const items: any[] = child.fromState
				? child.fromState(rawItems)
				: Array.isArray(rawItems)
					? rawItems
					: Object.values(rawItems);
			for (let i = 0; i < items.length; i++) {
				const ins = this.backend.compiler.compileInsert({
					table: child.table,
					values: child.toRow(items[i], i, parentId) as Record<string, any>,
				});
				statements.push({ sql: ins.sql, params: ins.params });
			}
		}
	}

	private appendChildDeletesById(
		statements: SqlStatement[],
		parentId: string,
	): void {
		for (const child of this.config.children ?? []) {
			const del = this.backend.compiler.compileDelete({
				table: child.table,
				where: [{ column: child.parentIdColumn, op: "eq", value: parentId }],
			});
			statements.push({ sql: del.sql, params: del.params });
		}
	}

	private buildScopeConditions(
		scope: { level: string; userId?: string | null },
		includeGlobal?: boolean,
	): QueryCondition[] {
		const conditions: QueryCondition[] = [];
		if (scope.level === "global") {
			conditions.push({ column: "scope_level", op: "eq", raw: "'global'" });
		} else {
			if (includeGlobal !== false) {
				conditions.push({
					OR: [
						{ column: "scope_level", op: "eq", raw: "'global'" },
						{
							AND: [
								{ column: "scope_level", op: "eq", value: "user" },
								{ column: "user_id", op: "eq", value: scope.userId ?? null },
							],
						},
					],
				});
			} else {
				conditions.push(
					{ column: "scope_level", op: "eq", value: "user" },
					{ column: "user_id", op: "eq", value: scope.userId ?? null },
				);
			}
		}
		return conditions;
	}

	private scopeConditions(scope: {
		level: string;
		userId?: string | null;
	}): QueryCondition[] {
		if (scope.level === "global") {
			return [{ column: "scope_level", op: "eq", raw: "'global'" }];
		}
		return [
			{
				OR: [
					{ column: "scope_level", op: "eq", raw: "'global'" },
					{
						AND: [
							{ column: "scope_level", op: "eq", value: "user" },
							{ column: "user_id", op: "eq", value: scope.userId ?? null },
						],
					},
				],
			},
		];
	}
}
