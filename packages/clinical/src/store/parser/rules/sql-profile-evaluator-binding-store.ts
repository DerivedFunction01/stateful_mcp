import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { RuleQueryCompiler } from "../../sql/rule-query-compiler";
import type { ParserProfileEvaluatorBindingStore } from "./interfaces";

export class SqlProfileEvaluatorBindingStore
	implements ParserProfileEvaluatorBindingStore
{
	private readonly compiler: RuleQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "parser_profile_evaluator_bindings",
	) {
		this.compiler = new RuleQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getEvaluatorBindingTableDDL(this.table);
		await this.executor.exec(ddl.sql);
		const idx = this.compiler.getEvaluatorBindingIndexDDL(this.table);
		await this.executor.exec(idx.sql, idx.params);
	}

	async bind(profileId: string, ruleId: string): Promise<void> {
		const { sql, params } = this.compiler.compileBindEvaluatorRule(
			profileId,
			ruleId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async unbind(profileId: string, ruleId: string): Promise<void> {
		const { sql, params } = this.compiler.compileUnbindEvaluatorRule(
			profileId,
			ruleId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async listBindings(profileId: string): Promise<string[]> {
		const { sql, params } = this.compiler.compileListEvaluatorRuleBindings(
			profileId,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => r.ruleId as string);
	}
}
