import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class RuleQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const attributeRulesTable = table;
		const evaluatorRulesTable = `${table}_evaluator`;

		const attributeRulesDDL = this.compiler.compileCreateTable({
			table: attributeRulesTable,
			ifNotExists: true,
			columns: [
				{ name: "ruleId", type: "TEXT", primaryKey: true },
				{ name: "targetField", type: "TEXT", nullable: false },
				{ name: "targetValue", type: "TEXT", nullable: false },
				{ name: "unitAnchor", type: "TEXT" },
				{
					name: "regexPatterns",
					type: "json",
					nullable: false,
					default: "[]",
				},
				{
					name: "isCaseInsensitive",
					type: "int",
					nullable: false,
					default: 0,
				},
				{ name: "blacklistPatterns", type: "json" },
				{ name: "metadata", type: "json" },
				{ name: "namedGroupContract", type: "json" },
			],
			checks: ["isCaseInsensitive IN (0, 1)"],
		});

		const evaluatorRulesDDL = this.compiler.compileCreateTable({
			table: evaluatorRulesTable,
			ifNotExists: true,
			columns: [
				{ name: "ruleId", type: "TEXT", primaryKey: true },
				{ name: "targetField", type: "TEXT", nullable: false },
				{ name: "evaluatorName", type: "TEXT", nullable: false },
				{
					name: "regexPatterns",
					type: "json",
					nullable: false,
					default: "[]",
				},
				{ name: "namedGroupContract", type: "json" },
			],
		});

		return [attributeRulesDDL, evaluatorRulesDDL];
	}

	public getIndexDDL(profileBindingsTable: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table: profileBindingsTable,
				name: `idx_${profileBindingsTable}_profile`,
				columns: ["profileId"],
			}),
		];
	}

	public compileGetAttributeRule(ruleId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "ruleId", op: "eq", value: ruleId }],
		});
	}

	public compileListAttributeRules(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "ruleId", direction: "ASC" }],
		});
	}

	public compileUpsertAttributeRule(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["ruleId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteAttributeRule(
		ruleId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "ruleId", op: "eq", value: ruleId }],
		});
	}

	public compileGetEvaluatorRule(ruleId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "ruleId", op: "eq", value: ruleId }],
		});
	}

	public compileListEvaluatorRules(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "ruleId", direction: "ASC" }],
		});
	}

	public compileUpsertEvaluatorRule(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["ruleId"];

		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteEvaluatorRule(
		ruleId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "ruleId", op: "eq", value: ruleId }],
		});
	}

	public compileBindAttributeRule(
		profileId: string,
		ruleId: string,
		priority: number,
		bindingsTable: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profileId", "ruleId"];

		return this.compiler.compileInsert({
			table: bindingsTable,
			values: {
				profileId: profileId,
				ruleId: ruleId,
				priority,
			},
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileUnbindAttributeRule(
		profileId: string,
		ruleId: string,
		bindingsTable: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table: bindingsTable,
			where: [
				{ column: "profileId", op: "eq", value: profileId },
				{ column: "ruleId", op: "eq", value: ruleId },
			],
		});
	}

	public compileListAttributeRuleBindings(
		profileId: string,
		bindingsTable: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: bindingsTable,
			where: [{ column: "profileId", op: "eq", value: profileId }],
			orderBy: [{ column: "priority", direction: "ASC" }],
		});
	}

	public compileBindEvaluatorRule(
		profileId: string,
		ruleId: string,
		evalBindingsTable: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profileId", "ruleId"];

		return this.compiler.compileInsert({
			table: evalBindingsTable,
			values: { profileId: profileId, ruleId: ruleId },
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileUnbindEvaluatorRule(
		profileId: string,
		ruleId: string,
		evalBindingsTable: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table: evalBindingsTable,
			where: [
				{ column: "profileId", op: "eq", value: profileId },
				{ column: "ruleId", op: "eq", value: ruleId },
			],
		});
	}

	public compileListEvaluatorRuleBindings(
		profileId: string,
		evalBindingsTable: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: evalBindingsTable,
			where: [{ column: "profileId", op: "eq", value: profileId }],
			orderBy: [{ column: "ruleId", direction: "ASC" }],
		});
	}
}
