import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ProfileQueryCompiler } from "../../sql/profile-query-compiler";
import type { ProfileTagStore } from "./interfaces";

export class SqlProfileTagStore implements ProfileTagStore {
	private readonly compiler: ProfileQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "parser_profiles",
	) {
		this.compiler = new ProfileQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
	}

	async getProfileTags(profileId: string): Promise<string[]> {
		const { sql, params } = this.compiler.compileListBindingsQuery(
			profileId,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => r.tagId as string);
	}

	async setProfileTags(profileId: string, tagIds: string[]): Promise<void> {
		const deleteAll = this.compiler.compileDeleteQuery(
			profileId,
			`${this.table}_tags`,
		);
		await this.executor.exec(deleteAll.sql, deleteAll.params);
		for (const tagId of tagIds) {
			const { sql, params } = this.compiler.compileBindQuery(
				profileId,
				tagId,
				this.table,
			);
			await this.executor.exec(sql, params);
		}
	}

	async deleteProfileTags(profileId: string, tagIds?: string[]): Promise<void> {
		if (tagIds && tagIds.length > 0) {
			for (const tagId of tagIds) {
				const { sql, params } = this.compiler.compileUnbindQuery(
					profileId,
					tagId,
					this.table,
				);
				await this.executor.exec(sql, params);
			}
		} else {
			const { sql, params } = this.compiler.compileDeleteQuery(
				profileId,
				`${this.table}_tags`,
			);
			await this.executor.exec(sql, params);
		}
	}
}
