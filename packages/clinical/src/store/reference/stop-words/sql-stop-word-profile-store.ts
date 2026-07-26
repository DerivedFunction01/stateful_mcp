import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { StopWordProfile } from "../../parser/interfaces";
import { ReferenceQueryCompiler } from "../../sql/reference-query-compiler";
import type { StopWordProfileStore } from "./interfaces";

export class SqlStopWordProfileStore implements StopWordProfileStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "stop_word_profiles",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getStopWordProfilesTableDDL(this.table);
		await this.executor.exec(ddl.sql);
	}

	async get(profileId: string): Promise<StopWordProfile | null> {
		const { sql, params } = this.compiler.compileGetStopWordProfile(
			profileId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToProfile(row) : null;
	}

	async list(): Promise<StopWordProfile[]> {
		const { sql, params } = this.compiler.compileListStopWordProfiles(
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToProfile(r));
	}

	async set(profile: StopWordProfile): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertStopWordProfile(
			this.profileToRow(profile),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(profileId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteStopWordProfile(
			profileId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private profileToRow(profile: StopWordProfile): Record<string, unknown> {
		return {
			profileId: profile.profileId,
			personnelId: profile.personnelId,
			localeFiles: JSON.stringify(profile.localeFiles),
			specialtyFiles: JSON.stringify(profile.specialtyFiles),
			customWords: JSON.stringify(profile.customWords),
			source: "local",
		};
	}

	private rowToProfile(row: Record<string, any>): StopWordProfile {
		return {
			profileId: row.profileId as string,
			personnelId: row.personnelId as string,
			localeFiles: (row.localeFiles as string[]) || [],
			specialtyFiles: (row.specialtyFiles as string[]) || [],
			customWords: (row.customWords as string[]) || [],
		};
	}
}
