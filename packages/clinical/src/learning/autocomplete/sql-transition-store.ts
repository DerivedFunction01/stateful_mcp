import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { AutocompleteTransitionQueryCompiler } from "../../stores/sql/autocomplete-transition-query-compiler";
import type {
	MacroTransitionObservation,
	MacroTransitionQuery,
	MacroTransitionRecord,
	MacroTransitionStore,
	NumericFeatureStatistics,
} from "../interfaces";

export class SqlMacroTransitionStore implements MacroTransitionStore {
	private readonly compiler: AutocompleteTransitionQueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "autocomplete_transitions",
	) {
		this.compiler = new AutocompleteTransitionQueryCompiler(dialect);
		this.ready = this.ensureTables();
	}

	private async ensureTables(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(query.sql, query.params);
		}
		for (const query of this.compiler.getIndexDDL(this.table)) {
			await this.executor.exec(query.sql, query.params);
		}
	}

	async increment(observation: MacroTransitionObservation): Promise<void> {
		await this.ready;
		if (observation.outcome === "negative") return;
		if (observation.observationId) {
			const exists = this.compiler.compileNumericExists(
				this.table,
				observation.observationId,
			);
			const existing = await this.executor.queryOne(exists.sql, exists.params);
			if (existing) return;
		}
		const increment = this.compiler.compileIncrement(this.table, observation);
		await this.executor.exec(increment.sql, increment.params);
		if (
			observation.numericalValue !== undefined &&
			observation.numericalValue !== null
		) {
			const numeric = this.compiler.compileAppendNumeric(this.table, {
				...observation,
				observationId: observation.observationId ?? crypto.randomUUID(),
			});
			await this.executor.exec(numeric.sql, numeric.params);
		}
	}

	async getByFromSlot(
		query: MacroTransitionQuery,
	): Promise<MacroTransitionRecord[]> {
		await this.ready;
		const compiled = this.compiler.compileLookup(this.table, query);
		const rows = await this.executor.query(compiled.sql, compiled.params);
		return rows.map((row) => ({
			macroId: row.macro_id as string,
			macroVersion: Number(row.macro_version),
			fromSlot: row.from_slot as string,
			toSlot: row.to_slot as string,
			featureKey: row.feature_key as string,
			featureValue: row.feature_value ? (row.feature_value as string) : null,
			scope: row.scope as "personal" | "global",
			scopeKey: row.scope_key as string,
			observationMode: row.observation_mode as "live" | "preview" | "execution",
			transitionCount: Number(row.transition_count ?? 0),
			lastUpdatedAt: row.last_updated_at as string,
		}));
	}

	async getNumericStatistics(
		query: MacroTransitionQuery,
	): Promise<Record<string, NumericFeatureStatistics>> {
		await this.ready;
		const compiled = this.compiler.compileNumericStatistics(this.table, query);
		const rows = await this.executor.query(compiled.sql, compiled.params);
		const result: Record<string, NumericFeatureStatistics> = {};
		for (const row of rows) {
			result[row.to_slot as string] = {
				count: Number(row.count ?? 0),
				mean: Number(row.mean ?? 0),
				standardDeviationPopulation:
					row.standard_deviation_population === null ||
					row.standard_deviation_population === undefined
						? null
						: Number(row.standard_deviation_population),
				lastUpdatedAt: row.last_updated_at as string | undefined,
			};
		}
		return result;
	}
}
