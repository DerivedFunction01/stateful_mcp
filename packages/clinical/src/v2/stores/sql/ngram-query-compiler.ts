import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export class NgramQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const createTable = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "ngram", type: "TEXT", nullable: false },
				{ name: "n", type: "INTEGER", nullable: false },
				{ name: "kind", type: "TEXT", nullable: false },
				{ name: "frequency", type: "INTEGER", default: 1 },
				{ name: "lastUpdatedAt", type: "TEXT", nullable: true },
				{ name: "templateId", type: "TEXT", nullable: true },
				{ name: "slotName", type: "TEXT", nullable: true },
			],
			primaryKey: ["ngram", "n", "kind"],
		});
		return [createTable];
	}

	public getIndexDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_prefix`,
				columns: ["ngram"],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_kind`,
				columns: ["kind", "frequency"],
			}),
		];
	}

	public compileIncrementQuery(
		table: string,
		ngram: string,
		n: number,
		kind: string,
		templateId?: string,
		slotName?: string,
	): CompiledQuery {
		const now = new Date().toISOString();
		const row: Record<string, unknown> = {
			ngram,
			n,
			kind,
			frequency: 1,
			lastUpdatedAt: now,
		};
		if (templateId !== undefined) row.templateId = templateId;
		if (slotName !== undefined) row.slotName = slotName;

		const conflictColumns = ["ngram", "n", "kind"];

		if (this.dialect === "sqlite") {
			return this.compiler.compileInsert({
				table,
				values: row,
				onConflict: {
					conflictColumns,
					update: {
						frequency: {
							func: "add",
							args: [
								{ column: "frequency" },
								{ column: "frequency", table: "excluded" },
							],
						},
						lastUpdatedAt: {
							column: "lastUpdatedAt",
							table: "excluded",
						},
					},
				},
			});
		}
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: {
				conflictColumns,
				update: {
					frequency: {
						func: "add",
						args: [
							{ column: "frequency", table },
							{ column: "frequency", table: "EXCLUDED" },
						],
					},
					lastUpdatedAt: {
						column: "lastUpdatedAt",
						table: "EXCLUDED",
					},
				},
			},
		});
	}

	public compileSuggestQuery(
		table: string,
		prefix: string,
		limit: number,
	): CompiledQuery {
		const { sql, params } = this.compiler.compileSelect({
			table,
			where: [{ column: "ngram", op: "like", value: `${prefix}%` }],
			orderBy: [{ column: "frequency", direction: "DESC" }],
			limit,
		});
		return { sql, params };
	}

	public compileGetTopByKindQuery(
		table: string,
		kind: string,
		limit: number,
	): CompiledQuery {
		const { sql, params } = this.compiler.compileSelect({
			table,
			where: [{ column: "kind", op: "eq", value: kind }],
			orderBy: [{ column: "frequency", direction: "DESC" }],
			limit,
		});
		return { sql, params };
	}
}
