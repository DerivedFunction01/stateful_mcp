import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ProfileQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "postgres") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const profileDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "profile_id", type: "TEXT", primaryKey: true },
				{ name: "personnel_id", type: "TEXT", nullable: false },
				{
					name: "is_default",
					type: "int",
					nullable: false,
					default: 0,
				},
				{
					name: "is_active",
					type: "int",
					nullable: false,
					default: 1,
				},
				{ name: "tag_token", type: "TEXT", nullable: false, default: "#" },
				{
					name: "state_delimiter",
					type: "TEXT",
					nullable: false,
					default: "||",
				},
				{
					name: "state_start_delimiter",
					type: "TEXT",
					nullable: false,
					default: "|",
				},
				{
					name: "state_end_delimiter",
					type: "TEXT",
					nullable: false,
					default: "|",
				},
				{
					name: "macro_start_token",
					type: "TEXT",
					nullable: false,
					default: "^",
				},
				{
					name: "variable_start_token",
					type: "TEXT",
					nullable: false,
					default: "{",
				},
				{
					name: "variable_end_token",
					type: "TEXT",
					nullable: false,
					default: "}",
				},
				{ name: "comment_start_token", type: "TEXT" },
				{ name: "comment_end_token", type: "TEXT" },
				{ name: "macro_placeholder", type: "TEXT" },
				{ name: "variable_delimiter", type: "TEXT" },
				{ name: "start_term_code_delimiter", type: "TEXT" },
				{ name: "start_term_display_delimiter", type: "TEXT" },
				{ name: "start_term_code_separator", type: "TEXT" },
				{ name: "start_term_delimiter", type: "TEXT" },
				{ name: "end_term_delimiter", type: "TEXT" },
				{ name: "attribute_delimiter", type: "TEXT" },
				{ name: "term_tokenizer", type: "TEXT" },
				{ name: "stop_word_threshold", type: "REAL" },
				{ name: "defaults_strategy", type: "TEXT" },
				{ name: "metadata", type: "json" },
			],
			uniques: [["personnel_id"]],
			checks: ["is_active IN (0, 1)", "is_default IN (0, 1)"],
		});

		const tagsTable = `${table}_tags`;
		const tagsDDL = this.compiler.compileCreateTable({
			table: tagsTable,
			ifNotExists: true,
			primaryKey: ["profile_id", "tag_id"],
			columns: [
				{ name: "profile_id", type: "TEXT", nullable: false },
				{ name: "tag_id", type: "TEXT", nullable: false },
			],
			foreignKeys: [
				{
					columns: ["profile_id"],
					refTable: table,
					refColumns: ["profile_id"],
					onDelete: "CASCADE",
				},
			],
		});

		return [profileDDL, tagsDDL];
	}

	public getIndexDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_personnel_active`,
				columns: ["personnel_id"],
				where: "is_active = 1",
			}),
		];
	}

	public compileGetQuery(profileId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
		});
	}

	public compileListQuery(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "profile_id", direction: "ASC" }],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profile_id"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteQuery(profileId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
		});
	}

	public compileBindQuery(
		profileId: string,
		tagId: string,
		table: string,
	): CompiledQuery {
		const tagsTable = `${table}_tags`;
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profile_id", "tag_id"];

		return this.compiler.compileInsert({
			table: tagsTable,
			values: { profile_id: profileId, tag_id: tagId },
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileUnbindQuery(
		profileId: string,
		tagId: string,
		table: string,
	): CompiledQuery {
		const tagsTable = `${table}_tags`;
		return this.compiler.compileDelete({
			table: tagsTable,
			where: [
				{ column: "profile_id", op: "eq", value: profileId },
				{ column: "tag_id", op: "eq", value: tagId },
			],
		});
	}

	public compileListBindingsQuery(
		profileId: string,
		table: string,
	): CompiledQuery {
		const tagsTable = `${table}_tags`;
		return this.compiler.compileSelect({
			table: tagsTable,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
			orderBy: [{ column: "tag_id", direction: "ASC" }],
		});
	}
}
