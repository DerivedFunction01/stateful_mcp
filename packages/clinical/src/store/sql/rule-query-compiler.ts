import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class RuleQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "postgres") {
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
				{ name: "rule_id", type: "TEXT", primaryKey: true },
				{ name: "target_field", type: "TEXT", nullable: false },
				{ name: "target_value", type: "TEXT", nullable: false },
				{ name: "unit_anchor", type: "TEXT" },
				{
					name: "regex_patterns",
					type: "json",
					nullable: false,
					default: "[]",
				},
				{
					name: "is_case_insensitive",
					type: "int",
					nullable: false,
					default: 0,
				},
				{ name: "blacklist_patterns", type: "json" },
				{ name: "metadata", type: "json" },
				{ name: "named_group_contract", type: "json" },
			],
			checks: ["is_case_insensitive IN (0, 1)"],
		});

		const evaluatorRulesDDL = this.compiler.compileCreateTable({
			table: evaluatorRulesTable,
			ifNotExists: true,
			columns: [
				{ name: "rule_id", type: "TEXT", primaryKey: true },
				{ name: "target_field", type: "TEXT", nullable: false },
				{ name: "evaluator_name", type: "TEXT", nullable: false },
				{
					name: "regex_patterns",
					type: "json",
					nullable: false,
					default: "[]",
				},
				{ name: "named_group_contract", type: "json" },
			],
		});

		return [attributeRulesDDL, evaluatorRulesDDL];
	}

	public getIndexDDL(profileBindingsTable: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table: profileBindingsTable,
				name: `idx_${profileBindingsTable}_profile`,
				columns: ["profile_id"],
			}),
		];
	}

	public compileGetAttributeRule(ruleId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "rule_id", op: "eq", value: ruleId }],
		});
	}

	public compileListAttributeRules(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "rule_id", direction: "ASC" }],
		});
	}

	public compileUpsertAttributeRule(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["rule_id"];

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
			where: [{ column: "rule_id", op: "eq", value: ruleId }],
		});
	}

	public compileGetEvaluatorRule(ruleId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "rule_id", op: "eq", value: ruleId }],
		});
	}

	public compileListEvaluatorRules(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "rule_id", direction: "ASC" }],
		});
	}

	public compileUpsertEvaluatorRule(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["rule_id"];

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
			where: [{ column: "rule_id", op: "eq", value: ruleId }],
		});
	}

	public compileBindAttributeRule(
		profileId: string,
		ruleId: string,
		priority: number,
		bindingsTable: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profile_id", "rule_id"];

		return this.compiler.compileInsert({
			table: bindingsTable,
			values: {
				profile_id: profileId,
				rule_id: ruleId,
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
				{ column: "profile_id", op: "eq", value: profileId },
				{ column: "rule_id", op: "eq", value: ruleId },
			],
		});
	}

	public compileListAttributeRuleBindings(
		profileId: string,
		bindingsTable: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: bindingsTable,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
			orderBy: [{ column: "priority", direction: "ASC" }],
		});
	}

	public compileBindEvaluatorRule(
		profileId: string,
		ruleId: string,
		evalBindingsTable: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profile_id", "rule_id"];

		return this.compiler.compileInsert({
			table: evalBindingsTable,
			values: { profile_id: profileId, rule_id: ruleId },
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
				{ column: "profile_id", op: "eq", value: profileId },
				{ column: "rule_id", op: "eq", value: ruleId },
			],
		});
	}

	public compileListEvaluatorRuleBindings(
		profileId: string,
		evalBindingsTable: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: evalBindingsTable,
			where: [{ column: "profile_id", op: "eq", value: profileId }],
			orderBy: [{ column: "rule_id", direction: "ASC" }],
		});
	}
}
