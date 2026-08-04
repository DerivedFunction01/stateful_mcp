import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";
import type {
	MacroTransitionObservation,
	MacroTransitionQuery,
} from "../../learning/interfaces";

export class AutocompleteTransitionQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect = "sqlite") {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table = "autocomplete_transitions"): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				columns: [
					{ name: "macro_id", type: "TEXT", nullable: false },
					{ name: "macro_version", type: "INTEGER", nullable: false },
					{ name: "from_slot", type: "TEXT", nullable: false },
					{ name: "to_slot", type: "TEXT", nullable: false },
					{ name: "feature_key", type: "TEXT", nullable: false },
					{ name: "feature_value", type: "TEXT", nullable: true },
					{ name: "scope", type: "TEXT", nullable: false },
					{ name: "scope_key", type: "TEXT", nullable: false },
					{ name: "observation_mode", type: "TEXT", nullable: false },
					{ name: "transition_count", type: "INTEGER", default: 0 },
					{ name: "last_updated_at", type: "TEXT", nullable: false },
				],
				primaryKey: [
					"macro_id",
					"macro_version",
					"from_slot",
					"to_slot",
					"feature_key",
					"feature_value",
					"scope",
					"scope_key",
					"observation_mode",
				],
			}),
			this.compiler.compileCreateTable({
				table: `${table}_numeric`,
				ifNotExists: true,
				columns: [
					{ name: "observation_id", type: "TEXT", nullable: false },
					{ name: "macro_id", type: "TEXT", nullable: false },
					{ name: "macro_version", type: "INTEGER", nullable: false },
					{ name: "from_slot", type: "TEXT", nullable: false },
					{ name: "to_slot", type: "TEXT", nullable: false },
					{ name: "feature_key", type: "TEXT", nullable: false },
					{ name: "feature_value", type: "TEXT", nullable: true },
					{ name: "scope", type: "TEXT", nullable: false },
					{ name: "scope_key", type: "TEXT", nullable: false },
					{ name: "observation_mode", type: "TEXT", nullable: false },
					{ name: "numerical_value", type: "REAL", nullable: false },
					{ name: "occurred_at", type: "TEXT", nullable: false },
				],
				primaryKey: ["observation_id"],
			}),
		];
	}

	getIndexDDL(table = "autocomplete_transitions"): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_lookup`,
				columns: [
					"macro_id",
					"macro_version",
					"from_slot",
					"scope",
					"scope_key",
				],
			}),
			this.compiler.compileCreateIndex({
				table: `${table}_numeric`,
				name: `idx_${table}_numeric_lookup`,
				columns: [
					"macro_id",
					"macro_version",
					"from_slot",
					"feature_key",
					"scope",
					"scope_key",
				],
			}),
		];
	}

	compileIncrement(
		table: string,
		observation: MacroTransitionObservation,
	): CompiledQuery {
		const values = this.rowValues(observation);
		values.transition_count = 1;
		values.last_updated_at = observation.occurredAt ?? new Date().toISOString();
		return this.compiler.compileInsert({
			table,
			values,
			onConflict: {
				conflictColumns: Object.keys(values).filter(
					(column) =>
						column !== "transition_count" && column !== "last_updated_at",
				),
				update: {
					transition_count: {
						func: "add",
						args: [
							{
								column: "transition_count",
								table: this.dialect === "sqlite" ? undefined : table,
							},
							{
								column: "transition_count",
								table: this.dialect === "sqlite" ? "excluded" : "EXCLUDED",
							},
						],
					},
					last_updated_at: {
						column: "last_updated_at",
						table: this.dialect === "sqlite" ? "excluded" : "EXCLUDED",
					},
				},
			},
		});
	}

	compileAppendNumeric(
		table: string,
		observation: MacroTransitionObservation,
	): CompiledQuery {
		if (!observation.observationId)
			throw new Error("Numeric observations require observationId");
		if (
			observation.numericalValue === undefined ||
			observation.numericalValue === null ||
			!Number.isFinite(observation.numericalValue)
		) {
			throw new Error("Numeric observations require a finite numericalValue");
		}
		return this.compiler.compileInsert({
			table: `${table}_numeric`,
			values: {
				observation_id: observation.observationId,
				...this.rowValues(observation),
				numerical_value: observation.numericalValue,
				occurred_at: observation.occurredAt ?? new Date().toISOString(),
			},
			onConflict: "ignore",
		});
	}

	compileNumericExists(table: string, observationId: string): CompiledQuery {
		return this.compiler.compileSelect({
			table: `${table}_numeric`,
			select: [{ column: "observation_id" }],
			where: [{ column: "observation_id", op: "eq", value: observationId }],
		});
	}

	compileLookup(table: string, query: MacroTransitionQuery): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			select: [
				{ column: "macro_id" },
				{ column: "macro_version" },
				{ column: "from_slot" },
				{ column: "to_slot" },
				{ column: "feature_key" },
				{ column: "feature_value" },
				{ column: "scope" },
				{ column: "scope_key" },
				{ column: "observation_mode" },
				{ column: "transition_count" },
				{ column: "last_updated_at" },
			],
			where: this.where(query),
			orderBy: [{ column: "transition_count", direction: "DESC" }],
		});
	}

	compileNumericStatistics(
		table: string,
		query: MacroTransitionQuery,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: `${table}_numeric`,
			select: [
				{ column: "to_slot" },
				{ column: "numerical_value", agg: "count", alias: "count" },
				{ column: "numerical_value", agg: "avg", alias: "mean" },
				{
					column: "numerical_value",
					agg: "stddev_pop",
					alias: "standard_deviation_population",
				},
				{ column: "occurred_at", agg: "max", alias: "last_updated_at" },
			],
			where: this.where(query),
			groupBy: [{ column: "to_slot" }],
		});
	}

	private rowValues(
		observation: MacroTransitionObservation,
	): Record<string, unknown> {
		return {
			macro_id: observation.macroId,
			macro_version: observation.macroVersion,
			from_slot: observation.fromSlot,
			to_slot: observation.toSlot,
			feature_key: observation.featureKey,
			feature_value: observation.featureValue ?? "",
			scope: observation.scope,
			scope_key: observation.scopeKey,
			observation_mode: observation.observationMode,
		};
	}

	private where(query: MacroTransitionQuery) {
		const conditions: any[] = [
			{ column: "macro_id", op: "eq", value: query.macroId },
			{ column: "macro_version", op: "eq", value: query.macroVersion },
			{ column: "from_slot", op: "eq", value: query.fromSlot },
			{ column: "scope", op: "eq", value: query.scope },
			{ column: "scope_key", op: "eq", value: query.scopeKey },
		];
		if (query.observationModes?.length)
			conditions.push({
				column: "observation_mode",
				op: "in_set",
				values: query.observationModes,
			});
		if (query.featureKey !== undefined)
			conditions.push({
				column: "feature_key",
				op: "eq",
				value: query.featureKey,
			});
		if (query.featureValue !== undefined)
			conditions.push({
				column: "feature_value",
				op: query.featureValue === null ? "is_null" : "eq",
				value: query.featureValue ?? "",
			});
		if (query.toSlots?.length)
			conditions.push({
				column: "to_slot",
				op: "in_set",
				values: query.toSlots,
			});
		return conditions;
	}
}
