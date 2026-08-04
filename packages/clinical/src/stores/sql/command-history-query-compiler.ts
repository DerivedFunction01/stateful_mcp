import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";
import type { CommandHistoryQuery } from "../../learning/command-history";

export class CommandHistoryQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect) {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table = "command_history_events"): CompiledQuery[] {
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				columns: [
					{ name: "event_id", type: "uuid", nullable: false },
					{ name: "scope", type: "TEXT", nullable: false },
					{ name: "scope_key", type: "TEXT", nullable: false },
					{ name: "session_id", type: "TEXT", nullable: false },
					{ name: "command_text", type: "TEXT", nullable: false },
					{ name: "canonical_verb", type: "TEXT", nullable: true },
					{ name: "command_id", type: "TEXT", nullable: true },
					{ name: "executed_at", type: "timestamp", nullable: false },
					{ name: "outcome", type: "TEXT", nullable: false },
				],
				primaryKey: ["event_id"],
				checks: [
					`scope IN ('session', 'all')`,
					`outcome IN ('success', 'failure', 'cancelled')`,
				],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_scope_time`,
				columns: ["scope", "scope_key", "executed_at"],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_command`,
				columns: ["scope", "scope_key", "command_text"],
			}),
			this.compiler.compileCreateTable({
				table: "command_history_arguments",
				ifNotExists: true,
				columns: [
					{ name: "event_id", type: "uuid", nullable: false },
					{ name: "argument_index", type: "integer", nullable: false },
					{ name: "argument_name", type: "TEXT", nullable: true },
					{ name: "argument_value", type: "TEXT", nullable: false },
				],
				primaryKey: ["event_id", "argument_index"],
			}),
		];
	}

	compileInsert(
		table: string,
		event: Record<string, unknown>,
	): CompiledQuery {
		return this.compiler.compileInsert({ table, values: event });
	}

	compileQuery(
		table: string,
		input: CommandHistoryQuery,
	): CompiledQuery {
		const scope = input.scope === "merged" || !input.scope ? undefined : input.scope;
		const where = [
			...(scope ? [{ column: "scope", op: "eq" as const, value: scope }] : []),
			...(scope === "session"
				? [{ column: "scope_key", op: "eq" as const, value: input.sessionId }]
				: []),
			...(input.prefix
				? [{ column: "command_text", op: "starts_with" as const, value: input.prefix }]
				: []),
		];
		return this.compiler.compileSelect({
			table,
			select: [
				{ column: "command_text" },
				{ column: "canonical_verb" },
				{ column: "command_id" },
				{ column: "scope" },
				{ column: "executed_at" },
			],
			where,
			orderBy: [{ column: "executed_at", direction: "DESC" }],
			limit: input.scope === "merged" || !input.scope ? undefined : input.limit ?? 100,
		});
	}
}
