import { QueryCompiler, type SqlDialect, type SqlExecutor } from "@stateful-mcp/core";
import type { UnifiedProfileRecord, UnifiedProfileStore } from "./profile-store";

/** Durable unified profile store. DDL is compiled with the PostgreSQL dialect. */
export class SqlProfileStore implements UnifiedProfileStore {
	private readonly compiler: QueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		_dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_profiles",
	) {
		this.compiler = new QueryCompiler(_dialect);
		this.ready = this.ensureTable();
	}

	async get(profileId: string): Promise<UnifiedProfileRecord | null> {
		await this.ready;
		const query = this.compiler.compileSelect({ table: this.table, where: [{ column: "profile_id", op: "eq", value: profileId }] });
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? fromRow(row) : null;
	}

	async list(): Promise<UnifiedProfileRecord[]> {
		await this.ready;
		const query = this.compiler.compileSelect({ table: this.table, orderBy: [{ column: "profile_id", direction: "ASC" }] });
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map(fromRow);
	}

	async set(profile: UnifiedProfileRecord): Promise<void> {
		await this.ready;
		const query = this.compiler.compileInsert({
			table: this.table,
			values: {
				profile_id: profile.profileId,
				kind: profile.kind,
				is_default: profile.isDefault ?? false,
				active: profile.active ?? true,
				metadata: JSON.stringify(profile.metadata ?? {}),
				payload: JSON.stringify(profile.payload),
			},
			onConflict: "replace",
			conflictColumns: ["profile_id"],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async delete(profileId: string): Promise<void> {
		await this.ready;
		const query = this.compiler.compileDelete({
			table: this.table,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
		});
		await this.executor.exec(query.sql, query.params);
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.compileCreateTable({
			table: this.table,
			ifNotExists: true,
			primaryKey: ["profile_id"],
			columns: [
				{ name: "profile_id", type: "text", nullable: false },
				{ name: "kind", type: "text", nullable: false },
				{ name: "is_default", type: "boolean", nullable: false, default: "false" },
				{ name: "active", type: "boolean", nullable: false, default: "true" },
				{ name: "metadata", type: "text", nullable: false },
				{ name: "payload", type: "text", nullable: false },
			],
		});
		await this.executor.exec(ddl.sql, ddl.params);
	}
}

function fromRow(row: Record<string, unknown>): UnifiedProfileRecord {
	return {
		profileId: String(row.profile_id),
		kind: row.kind as UnifiedProfileRecord["kind"],
		isDefault: Boolean(row.is_default),
		active: Boolean(row.active),
		metadata: parseJson(row.metadata) as Record<string, unknown>,
		payload: parseJson(row.payload),
	};
}

function parseJson(value: unknown): unknown {
	return typeof value === "string" ? JSON.parse(value) : value;
}
