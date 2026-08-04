import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export class MacroParseQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(readonly dialect: SqlDialect) {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table = "macro_parse_events"): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				columns: [
					{ name: "id", type: "TEXT", nullable: false },
					{ name: "macro_id", type: "TEXT", nullable: false },
					{ name: "macro_version", type: "integer", nullable: false },
					{ name: "argument_name", type: "TEXT", nullable: false },
					{ name: "argument_kind", type: "TEXT", nullable: false },
					{ name: "raw_term", type: "TEXT", nullable: false },
					{ name: "parsed_value", type: "TEXT", nullable: false },
					{ name: "corrected_value", type: "TEXT", nullable: true },
					{ name: "outcome", type: "TEXT", nullable: false },
					{ name: "personnel_id", type: "TEXT", nullable: true },
					{ name: "timestamp", type: "TEXT", nullable: false },
				],
				primaryKey: ["id"],
				checks: [`outcome IN ('accepted', 'corrected', 'rejected')`],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_lookup`,
				columns: ["macro_id", "argument_name", "raw_term"],
			}),
			this.compiler.compileCreateTable({
				table: "macro_parse_aggregates",
				ifNotExists: true,
				columns: [
					{ name: "macro_id", type: "TEXT", nullable: false },
					{ name: "argument_name", type: "TEXT", nullable: false },
					{ name: "raw_term", type: "TEXT", nullable: false },
					{ name: "parsed_value", type: "TEXT", nullable: false },
					{ name: "accepted_count", type: "integer", default: 0 },
					{ name: "corrected_count", type: "integer", default: 0 },
					{ name: "rejected_count", type: "integer", default: 0 },
					{ name: "last_updated_at", type: "timestamp", nullable: false },
				],
				primaryKey: ["macro_id", "argument_name", "raw_term", "parsed_value"],
			}),
		];
	}

	compileInsert(table: string, values: Record<string, unknown>): CompiledQuery {
		return this.compiler.compileInsert({ table, values });
	}

	compileCount(table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			select: [{ raw: "COUNT(*) as count" }],
		});
	}

	compilePruneSelect(table: string, limit: number): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			select: [
				{ column: "id" },
				{ column: "macro_id" },
				{ column: "macro_version" },
				{ column: "argument_name" },
				{ column: "argument_kind" },
				{ column: "raw_term" },
				{ column: "parsed_value" },
				{ column: "corrected_value" },
				{ column: "outcome" },
				{ column: "personnel_id" },
				{ column: "timestamp" },
			],
			orderBy: [{ column: "timestamp", direction: "ASC" }],
			limit,
		});
	}

	compileDelete(table: string, ids: string[]): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "id", op: "in_set" as const, values: ids }],
		});
	}

	compileUpsertAggregate(
		macroId: string,
		argumentName: string,
		rawTerm: string,
		parsedValue: string,
		outcome: "accepted" | "corrected" | "rejected",
		timestamp: string,
	): CompiledQuery {
		const isAccepted = outcome === "accepted" ? 1 : 0;
		const isCorrected = outcome === "corrected" ? 1 : 0;
		const isRejected = outcome === "rejected" ? 1 : 0;

		return this.compiler.compileInsert({
			table: "macro_parse_aggregates",
			values: {
				macro_id: macroId,
				argument_name: argumentName,
				raw_term: rawTerm,
				parsed_value: parsedValue,
				accepted_count: isAccepted,
				corrected_count: isCorrected,
				rejected_count: isRejected,
				last_updated_at: timestamp,
			},
			onConflict: {
				conflictColumns: [
					"macro_id",
					"argument_name",
					"raw_term",
					"parsed_value",
				],
				update: {
					accepted_count: { raw: "accepted_count + EXCLUDED.accepted_count" },
					corrected_count: {
						raw: "corrected_count + EXCLUDED.corrected_count",
					},
					rejected_count: { raw: "rejected_count + EXCLUDED.rejected_count" },
					last_updated_at: {
						raw: "CASE WHEN EXCLUDED.last_updated_at > last_updated_at THEN EXCLUDED.last_updated_at ELSE last_updated_at END",
					},
				},
			},
		});
	}

	compileConfidenceLookup(
		macroId: string,
		argumentName: string,
		rawTerm: string,
		parsedValue: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: "macro_parse_aggregates",
			select: [
				{ column: "accepted_count" },
				{ column: "corrected_count" },
				{ column: "rejected_count" },
			],
			where: [
				{ column: "macro_id", op: "eq" as const, value: macroId },
				{ column: "argument_name", op: "eq" as const, value: argumentName },
				{ column: "raw_term", op: "eq" as const, value: rawTerm },
				{ column: "parsed_value", op: "eq" as const, value: parsedValue },
			],
		});
	}

	compileRawConfidenceLookup(
		macroId: string,
		argumentName: string,
		rawTerm: string,
		parsedValue: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table: "macro_parse_events",
			select: [{ column: "outcome" }, { raw: "COUNT(*) as count" }],
			where: [
				{ column: "macro_id", op: "eq" as const, value: macroId },
				{ column: "argument_name", op: "eq" as const, value: argumentName },
				{ column: "raw_term", op: "eq" as const, value: rawTerm },
				{ column: "parsed_value", op: "eq" as const, value: parsedValue },
			],
			groupBy: [{ column: "outcome" }],
		});
	}
}
