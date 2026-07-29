import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { AutocompleteTransitionQueryCompiler } from "../../sql/autocomplete-transition-query-compiler";
import type {
	AutocompleteTransitionContinuousAggregatePlan,
	AutocompleteTransitionDecayedAggregatePlan,
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionKey,
	AutocompleteTransitionRecord,
	AutocompleteTransitionStore,
} from "../interfaces";

const DEFAULT_TABLE = "autocomplete_transitions";

export class SqlAutocompleteTransitionStore
	implements AutocompleteTransitionStore
{
	private compiler: AutocompleteTransitionQueryCompiler;
	private table: string;
	private executor: SqlExecutor;
	dialect: SqlDialect;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table: string = DEFAULT_TABLE,
	) {
		this.dialect = dialect;
		this.executor = executor;
		this.compiler = new AutocompleteTransitionQueryCompiler(dialect);
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddls = this.compiler.getTableDDL(this.table);
		for (const ddl of ddls) {
			await this.executor.exec(ddl.sql, ddl.params);
		}

		const indexes = this.compiler.getIndexDDL(this.table);
		for (const idx of indexes) {
			await this.executor.exec(idx.sql, idx.params);
		}
	}

	async increment(plan: AutocompleteTransitionInsertPlan): Promise<void> {
		const { sql, params } = this.compiler.compileIncrementQuery(plan);
		await this.executor.exec(sql, params);
	}

	async getByFromSlot(
		key: AutocompleteTransitionKey,
	): Promise<AutocompleteTransitionRecord[]> {
		const { sql, params } = this.compiler.compileGetByFromSlotQuery(
			key,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => this.rowToRecord(row));
	}

	async getDecayedAggregate(
		plan: AutocompleteTransitionDecayedAggregatePlan,
	): Promise<Record<string, number>> {
		const { sql, params } = this.compiler.compileDecayedAggregateQuery(plan);
		const rows = await this.executor.query(sql, params);
		const result: Record<string, number> = {};
		for (const row of rows) {
			const toSlot = row.toSlot as string;
			const decayedTotal = Number(row.decayed_total) || 0;
			result[toSlot] = decayedTotal;
		}
		return result;
	}

	async getContinuousAggregate(
		plan: AutocompleteTransitionContinuousAggregatePlan,
	): Promise<Record<string, { mu: number; sigmaSq: number }>> {
		const { sql, params } = this.compiler.compileContinuousAggregateQuery(plan);
		const rows = await this.executor.query(sql, params);
		const result: Record<string, { mu: number; sigmaSq: number }> = {};
		for (const row of rows) {
			const toSlot = row.toSlot as string;
			result[toSlot] = {
				mu: Number(row.mu) || 0,
				sigmaSq: Number(row.sigmaSq) || 0,
			};
		}
		return result;
	}

	private rowToRecord(
		row: Record<string, unknown>,
	): AutocompleteTransitionRecord {
		return {
			personnelId: row.personnelId as string,
			templateId: row.templateId as string,
			fromSlot: row.fromSlot as string,
			toSlot: row.toSlot as string,
			featureKey: row.featureKey as string,
			featureValue: (row.featureValue as string) ?? null,
			numericalValue:
				row.numericalValue != null ? Number(row.numericalValue) : null,
			selectionCount: Number(row.selectionCount) || 0,
			lastUpdatedAt: row.lastUpdatedAt as string,
		};
	}
}
