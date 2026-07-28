import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { RuleQueryCompiler } from "../../sql/rule-query-compiler";
import type { ConceptFieldRuleBindingStore } from "./interfaces";

export class SqlConceptFieldRuleBindingStore
	implements ConceptFieldRuleBindingStore
{
	private readonly compiler: RuleQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "concept_field_rule_bindings",
	) {
		this.compiler = new RuleQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const indexes = this.compiler.getIndexDDL(this.table);
		for (const idx of indexes) {
			await this.executor.exec(idx.sql, idx.params);
		}
	}

	async bind(
		profileId: string,
		ruleId: string,
		priority: number,
	): Promise<void> {
		const { sql, params } = this.compiler.compileBindAttributeRule(
			profileId,
			ruleId,
			priority,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async unbind(profileId: string, ruleId: string): Promise<void> {
		const { sql, params } = this.compiler.compileUnbindAttributeRule(
			profileId,
			ruleId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async listBindings(
		profileId: string,
	): Promise<Array<{ ruleId: string; priority: number }>> {
		const { sql, params } = this.compiler.compileListAttributeRuleBindings(
			profileId,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => ({
			ruleId: r.ruleId as string,
			priority: Number(r.priority),
		}));
	}
}
