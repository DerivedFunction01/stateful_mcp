import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { RuleQueryCompiler } from "../../sql/rule-query-compiler";
import type { ParserDictionaryRule } from "../interfaces";
import type { ParserEvaluatorRuleStore } from "./interfaces";

export class SqlParserEvaluatorRuleStore implements ParserEvaluatorRuleStore {
	private readonly compiler: RuleQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "parser_evaluator_rules",
	) {
		this.compiler = new RuleQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getEvaluatorTableDDL(this.table);
		await this.executor.exec(ddl.sql);
	}

	async get(ruleId: string): Promise<ParserDictionaryRule | null> {
		const { sql, params } = this.compiler.compileGetEvaluatorRule(
			ruleId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRule(row) : null;
	}

	async list(): Promise<ParserDictionaryRule[]> {
		const { sql, params } = this.compiler.compileListEvaluatorRules(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRule(r));
	}

	async set(rule: ParserDictionaryRule): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertEvaluatorRule(
			this.ruleToRow(rule),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(ruleId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteEvaluatorRule(
			ruleId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private ruleToRow(rule: ParserDictionaryRule): Record<string, unknown> {
		return {
			ruleId: rule.ruleId,
			targetField: rule.targetField,
			evaluatorName: rule.evaluatorName,
			regexPatterns: JSON.stringify(rule.regexPatterns),
			namedGroupContract: rule.namedGroupContract
				? JSON.stringify(rule.namedGroupContract)
				: null,
		};
	}

	private rowToRule(row: Record<string, any>): ParserDictionaryRule {
		return {
			ruleId: row.ruleId as string,
			targetField: row.targetField as string,
			evaluatorName: row.evaluatorName as string,
			regexPatterns: (row.regexPatterns as string[]) || [],
			namedGroupContract: (row.namedGroupContract as any) || undefined,
		};
	}
}
