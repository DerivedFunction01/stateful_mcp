import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export class WeightQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				columns: [
					{ name: "category", type: "TEXT", nullable: false },
					{ name: "key", type: "TEXT", nullable: false },
					{ name: "sub_key", type: "TEXT", nullable: false, default: "" },
					{ name: "value", type: "real", nullable: false },
				],
				primaryKey: ["category", "key", "sub_key"],
			}),
		];
	}

	public compileGetWeight(
		table: string,
		category: string,
		key: string,
		subKey?: string,
	): CompiledQuery {
		const sk = subKey ?? "";
		return this.compiler.compileSelect({
			table,
			select: [{ column: "value" }],
			where: [
				{ column: "category", op: "eq", value: category },
				{ column: "key", op: "eq", value: key },
				{ column: "sub_key", op: "eq", value: sk },
			],
		});
	}

	public compileSetWeight(
		table: string,
		category: string,
		key: string,
		value: number,
		subKey?: string,
	): CompiledQuery {
		const sk = subKey ?? "";
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["category", "key", "sub_key"];
		return this.compiler.compileInsert({
			table,
			values: { category, key, sub_key: sk, value },
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileGetWeightsForCategory(
		table: string,
		category: string,
		key: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			select: [{ column: "sub_key" }, { column: "value" }],
			where: [
				{ column: "category", op: "eq", value: category },
				{ column: "key", op: "eq", value: key },
			],
		});
	}
}
