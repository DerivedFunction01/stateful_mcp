import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ProfileQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const profileDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "profileId", type: "TEXT", primaryKey: true },
				{ name: "personnelId", type: "TEXT", nullable: false },
				{
					name: "isDefault",
					type: "int",
					nullable: false,
					default: 0,
				},
				{
					name: "isActive",
					type: "int",
					nullable: false,
					default: 1,
				},
				{ name: "syntax", type: "json" },
				{ name: "metadata", type: "json" },
			],
			uniques: [["personnelId"]],
			checks: ["isActive IN (0, 1)", "isDefault IN (0, 1)"],
		});

		const tagsTable = `${table}_tags`;
		const tagsDDL = this.compiler.compileCreateTable({
			table: tagsTable,
			ifNotExists: true,
			primaryKey: ["profileId", "tagId"],
			columns: [
				{ name: "profileId", type: "TEXT", nullable: false },
				{ name: "tagId", type: "TEXT", nullable: false },
			],
			foreignKeys: [
				{
					columns: ["profileId"],
					refTable: table,
					refColumns: ["profileId"],
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
				columns: ["personnelId"],
				where: "isActive = 1",
			}),
		];
	}

	public compileGetQuery(profileId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "profileId", op: "eq", value: profileId }],
		});
	}

	public compileListQuery(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "profileId", direction: "ASC" }],
		});
	}

	public compileUpsertQuery(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profileId"];

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
			where: [{ column: "profileId", op: "eq", value: profileId }],
		});
	}

	public compileBindQuery(
		profileId: string,
		tagId: string,
		table: string,
	): CompiledQuery {
		const tagsTable = `${table}_tags`;
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profileId", "tagId"];

		return this.compiler.compileInsert({
			table: tagsTable,
			values: { profileId: profileId, tagId: tagId },
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
				{ column: "profileId", op: "eq", value: profileId },
				{ column: "tagId", op: "eq", value: tagId },
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
			where: [{ column: "profileId", op: "eq", value: profileId }],
			orderBy: [{ column: "tagId", direction: "ASC" }],
		});
	}
}
