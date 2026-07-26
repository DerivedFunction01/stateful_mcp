import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { RuleQueryCompiler } from "../../sql/rule-query-compiler";
import type {
	ParserAttributeRuleStore,
	StoredAttributeRule,
} from "./interfaces";

export class SqlParserAttributeRuleStore implements ParserAttributeRuleStore {
	private readonly compiler: RuleQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "parser_attribute_rules",
	) {
		this.compiler = new RuleQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(ddl.sql);
		}
	}

	async get(ruleId: string): Promise<StoredAttributeRule | null> {
		const { sql, params } = this.compiler.compileGetAttributeRule(
			ruleId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRule(row) : null;
	}

	async list(): Promise<StoredAttributeRule[]> {
		const { sql, params } = this.compiler.compileListAttributeRules(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToRule(r));
	}

	async set(rule: StoredAttributeRule): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertAttributeRule(
			this.ruleToRow(rule),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(ruleId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteAttributeRule(
			ruleId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private ruleToRow(rule: StoredAttributeRule): Record<string, unknown> {
		return {
			ruleId: rule.ruleId,
			targetField: rule.targetField,
			targetValue: rule.targetValue,
			unitAnchor: (rule as any).unitAnchor ?? null,
			regexPatterns: JSON.stringify(rule.regexPatterns),
			isCaseInsensitive: rule.isCaseInsensitive ? 1 : 0,
			blacklistPatterns: rule.blacklistPatterns
				? JSON.stringify(rule.blacklistPatterns)
				: null,
			metadata: (rule as any).metadata
				? JSON.stringify((rule as any).metadata)
				: null,
			namedGroupContract: rule.namedGroupContract
				? JSON.stringify(rule.namedGroupContract)
				: null,
		};
	}

	private rowToRule(row: Record<string, any>): StoredAttributeRule {
		const rule: StoredAttributeRule = {
			ruleId: row.ruleId as string,
			targetField: row.targetField as string,
			targetValue: row.targetValue as string,
			regexPatterns: (row.regexPatterns as string[]) || [],
		} as unknown as StoredAttributeRule;
		if (row.unitAnchor != null)
			(rule as any).unitAnchor = row.unitAnchor as string;
		if (row.isCaseInsensitive != null)
			rule.isCaseInsensitive = (row.isCaseInsensitive as number) === 1;
		if (row.blacklistPatterns != null)
			rule.blacklistPatterns = row.blacklistPatterns as string[];
		if (row.metadata != null)
			(rule as any).metadata = row.metadata as Record<string, any>;
		if (row.namedGroupContract != null)
			rule.namedGroupContract = row.namedGroupContract as any;
		return rule;
	}
}
