import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
	type SqlExpression,
} from "@stateful-mcp/core";
import type {
	AutocompleteTransitionContinuousAggregatePlan,
	AutocompleteTransitionDecayedAggregatePlan,
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionKey,
} from "../learning/interfaces";

export class AutocompleteTransitionQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery[] {
		const createTable = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "personnelId", type: "TEXT", nullable: false },
				{ name: "templateId", type: "TEXT", nullable: false },
				{ name: "fromSlot", type: "TEXT", nullable: false },
				{ name: "toSlot", type: "TEXT", nullable: false },
				{ name: "featureKey", type: "TEXT", nullable: false },
				{ name: "featureValue", type: "TEXT", nullable: true },
				{ name: "numericalValue", type: "real", nullable: true },
				{ name: "selectionCount", type: "int", default: 0 },
				{ name: "lastUpdatedAt", type: "timestamp", default: "now" },
			],
			primaryKey: [
				"personnelId",
				"templateId",
				"fromSlot",
				"toSlot",
				"featureKey",
			],
		});
		return [createTable];
	}

	public getIndexDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_lookup`,
				columns: ["personnelId", "templateId", "fromSlot"],
			}),
		];
	}

	public compileIncrementQuery(
		plan: AutocompleteTransitionInsertPlan,
	): CompiledQuery {
		const row = {
			personnelId: plan.personnelId,
			templateId: plan.templateId,
			fromSlot: plan.fromSlot,
			toSlot: plan.toSlot,
			featureKey: plan.featureKey,
			featureValue: plan.featureValue,
			numericalValue: plan.numericalValue,
			selectionCount: plan.selectionCount,
			lastUpdatedAt: plan.lastUpdatedAt,
		};

		const conflictColumns = [
			"personnelId",
			"templateId",
			"fromSlot",
			"toSlot",
			"featureKey",
		];

		if (this.dialect === "sqlite") {
			return this.compiler.compileInsert({
				table: plan.table,
				values: row,
				onConflict: {
					conflictColumns,
					update: {
						selectionCount: {
							func: "add",
							args: [
								{ column: "selectionCount" },
								{ column: "selectionCount", table: "excluded" },
							],
						},
						lastUpdatedAt: {
							column: "lastUpdatedAt",
							table: "excluded",
						},
					},
				},
			});
		} else {
			return this.compiler.compileInsert({
				table: plan.table,
				values: row,
				onConflict: {
					conflictColumns,
					update: {
						selectionCount: {
							func: "add",
							args: [
								{ column: "selectionCount", table: "autocomplete_transitions" },
								{ column: "selectionCount", table: "EXCLUDED" },
							],
						},
						lastUpdatedAt: {
							column: "lastUpdatedAt",
							table: "EXCLUDED",
						},
					},
				},
			});
		}
	}

	public compileGetByFromSlotQuery(
		key: AutocompleteTransitionKey,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [
				{ column: "personnelId", op: "eq", value: key.personnelId },
				{ column: "templateId", op: "eq", value: key.templateId },
				{ column: "fromSlot", op: "eq", value: key.fromSlot },
			],
		});
	}

	public compileDecayedAggregateQuery(
		plan: AutocompleteTransitionDecayedAggregatePlan,
	): CompiledQuery {
		// Newer maximum interaction query segment (subquery CTE or inline subquery)
		const newestSubquery = {
			table: plan.table,
			select: [
				{ column: "lastUpdatedAt", agg: "max" as const, alias: "max_t" },
			],
			where: [
				{ column: "personnelId", op: "eq" as const, value: plan.personnelId },
				{ column: "templateId", op: "eq" as const, value: plan.templateId },
			],
		};

		const halfLifeSecs = plan.halfLifeDays * 86400.0;

		// Calculate epoch difference: (newest.max_t - lastUpdatedAt)
		// We use dialect-specific epoch calculation structures
		let epochDiffExpr: SqlExpression;
		if (this.dialect === "postgres") {
			epochDiffExpr = {
				func: "epoch",
				args: [
					{
						func: "subtract",
						args: [
							{ column: "max_t", table: "newest" },
							{ column: "lastUpdatedAt", table: "t" },
						],
					},
				],
			};
		} else {
			// Leverage the compiler's native epoch function operator for dialect independence
			epochDiffExpr = {
				func: "subtract",
				args: [
					{
						func: "epoch",
						args: [{ column: "max_t", table: "newest" }],
					},
					{
						func: "epoch",
						args: [{ column: "lastUpdatedAt", table: "t" }],
					},
				],
			};
		}

		// Decay multiplier expression: power(0.5, epochDiff / halfLifeSecs)
		const decayMultiplierExpr: SqlExpression = {
			func: "power",
			args: [
				{ value: 0.5 },
				{
					func: "divide",
					args: [epochDiffExpr, { value: halfLifeSecs }],
				},
			],
		};

		// final sum: selectionCount * decayMultiplier
		const selectFieldExpr: SqlExpression = {
			func: "multiply",
			args: [{ column: "selectionCount", table: "t" }, decayMultiplierExpr],
		};

		return this.compiler.compileSelect({
			table: plan.table,
			alias: "t",
			select: [
				{ column: "toSlot", table: "t" },
				{ expr: selectFieldExpr, agg: "sum" as const, alias: "decayed_total" },
			],
			joins: [
				{
					type: "cross",
					table: { query: newestSubquery, alias: "newest" },
				},
			],
			where: [
				{
					column: "personnelId",
					table: "t",
					op: "eq" as const,
					value: plan.personnelId,
				},
				{
					column: "templateId",
					table: "t",
					op: "eq" as const,
					value: plan.templateId,
				},
				{
					column: "fromSlot",
					table: "t",
					op: "eq" as const,
					value: plan.fromSlot,
				},
			],
			groupBy: [{ column: "toSlot", table: "t" }],
		});
	}

	public compileContinuousAggregateQuery(
		plan: AutocompleteTransitionContinuousAggregatePlan,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: plan.table,
			select: [
				{ column: "toSlot" },
				{ column: "numericalValue", agg: "avg" as const, alias: "mu" },
				{
					column: "numericalValue",
					agg: "var_samp" as const,
					alias: "sigmaSq",
				},
			],
			where: [
				{ column: "personnelId", op: "eq" as const, value: plan.personnelId },
				{ column: "templateId", op: "eq" as const, value: plan.templateId },
				{ column: "fromSlot", op: "eq" as const, value: plan.fromSlot },
				{ column: "featureKey", op: "eq" as const, value: plan.featureKey },
				{ column: "numericalValue", op: "is_not_null" as const },
			],
			groupBy: [{ column: "toSlot" }],
		});
	}
}
