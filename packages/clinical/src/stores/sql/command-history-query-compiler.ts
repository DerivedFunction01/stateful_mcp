import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";
import type { CommandHistoryQuery } from "../../learning/command-history";

export class CommandHistoryQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(readonly dialect: SqlDialect) {
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
			this.compiler.compileCreateTable({
				table: "command_history_aggregates",
				ifNotExists: true,
				columns: [
					{ name: "command_text", type: "TEXT", nullable: false },
					{ name: "canonical_verb", type: "TEXT", nullable: true },
					{ name: "command_id", type: "TEXT", nullable: true },
					{ name: "scope", type: "TEXT", nullable: false },
					{ name: "scope_key", type: "TEXT", nullable: false },
					{ name: "success_count", type: "integer", default: 0 },
					{ name: "failure_count", type: "integer", default: 0 },
					{ name: "last_used_at", type: "timestamp", nullable: false },
				],
				primaryKey: ["command_text", "scope", "scope_key"],
			}),
			this.compiler.compileCreateTable({
				table: "command_history_argument_aggregates",
				ifNotExists: true,
				columns: [
					{ name: "command_id", type: "TEXT", nullable: false },
					{ name: "argument_index", type: "integer", nullable: false },
					{ name: "argument_name", type: "TEXT", nullable: true },
					{ name: "argument_value", type: "TEXT", nullable: false },
					{ name: "scope", type: "TEXT", nullable: false },
					{ name: "scope_key", type: "TEXT", nullable: false },
					{ name: "use_count", type: "integer", default: 0 },
					{ name: "last_used_at", type: "timestamp", nullable: false },
				],
				primaryKey: [
					"command_id",
					"argument_index",
					"argument_value",
					"scope",
					"scope_key",
				],
			}),
		];
	}

	compileInsert(table: string, event: Record<string, unknown>): CompiledQuery {
		return this.compiler.compileInsert({ table, values: event });
	}

	compileQuery(table: string, input: CommandHistoryQuery): CompiledQuery {
		const scope =
			input.scope === "merged" || !input.scope ? undefined : input.scope;
		const where = [
			...(scope ? [{ column: "scope", op: "eq" as const, value: scope }] : []),
			...(scope === "session"
				? [{ column: "scope_key", op: "eq" as const, value: input.sessionId }]
				: []),
			...(input.prefix
				? [
						{
							column: "command_text",
							op: "starts_with" as const,
							value: input.prefix,
						},
					]
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
			limit:
				input.scope === "merged" || !input.scope
					? undefined
					: (input.limit ?? 100),
		});
	}

	compilePruneSelect(table: string, limit: number): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			select: [
				{ column: "event_id" },
				{ column: "scope" },
				{ column: "scope_key" },
				{ column: "command_text" },
				{ column: "canonical_verb" },
				{ column: "command_id" },
				{ column: "executed_at" },
				{ column: "outcome" },
			],
			orderBy: [{ column: "executed_at", direction: "ASC" }],
			limit,
		});
	}

	compileGetArguments(eventIds: string[]): CompiledQuery {
		return this.compiler.compileSelect({
			table: "command_history_arguments",
			select: [
				{ column: "event_id" },
				{ column: "argument_index" },
				{ column: "argument_name" },
				{ column: "argument_value" },
			],
			where: [{ column: "event_id", op: "in_set" as const, values: eventIds }],
		});
	}

	compileCount(table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			select: [{ raw: "COUNT(*) as count" }],
		});
	}

	compileDelete(table: string, eventIds: string[]): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "event_id", op: "in_set" as const, values: eventIds }],
		});
	}

	compileUpsertCommandAggregate(
		commandText: string,
		scope: string,
		scopeKey: string,
		canonicalVerb: string | null,
		commandId: string | null,
		successCount: number,
		failureCount: number,
		lastUsedAt: string,
	): CompiledQuery {
		return this.compiler.compileInsert({
			table: "command_history_aggregates",
			values: {
				command_text: commandText,
				scope,
				scope_key: scopeKey,
				canonical_verb: canonicalVerb,
				command_id: commandId,
				success_count: successCount,
				failure_count: failureCount,
				last_used_at: lastUsedAt,
			},
			onConflict: {
				conflictColumns: ["command_text", "scope", "scope_key"],
				update: {
					success_count: { raw: "success_count + EXCLUDED.success_count" },
					failure_count: { raw: "failure_count + EXCLUDED.failure_count" },
					last_used_at: {
						raw: "CASE WHEN EXCLUDED.last_used_at > last_used_at THEN EXCLUDED.last_used_at ELSE last_used_at END",
					},
				},
			},
		});
	}

	compileUpsertArgumentAggregate(
		commandId: string,
		argumentIndex: number,
		argumentName: string | null,
		argumentValue: string,
		scope: string,
		scopeKey: string,
		useCount: number,
		lastUsedAt: string,
	): CompiledQuery {
		return this.compiler.compileInsert({
			table: "command_history_argument_aggregates",
			values: {
				command_id: commandId,
				argument_index: argumentIndex,
				argument_name: argumentName,
				argument_value: argumentValue,
				scope,
				scope_key: scopeKey,
				use_count: useCount,
				last_used_at: lastUsedAt,
			},
			onConflict: {
				conflictColumns: [
					"command_id",
					"argument_index",
					"argument_value",
					"scope",
					"scope_key",
				],
				update: {
					use_count: { raw: "use_count + EXCLUDED.use_count" },
					last_used_at: {
						raw: "CASE WHEN EXCLUDED.last_used_at > last_used_at THEN EXCLUDED.last_used_at ELSE last_used_at END",
					},
				},
			},
		});
	}

	compileAggregateQuery(input: CommandHistoryQuery): CompiledQuery {
		const scope =
			input.scope === "merged" || !input.scope ? undefined : input.scope;
		const where = [
			...(scope ? [{ column: "scope", op: "eq" as const, value: scope }] : []),
			...(scope === "session"
				? [{ column: "scope_key", op: "eq" as const, value: input.sessionId }]
				: []),
			...(input.prefix
				? [
						{
							column: "command_text",
							op: "starts_with" as const,
							value: input.prefix,
						},
					]
				: []),
		];
		return this.compiler.compileSelect({
			table: "command_history_aggregates",
			select: [
				{ column: "command_text" },
				{ column: "canonical_verb" },
				{ column: "command_id" },
				{ column: "scope" },
				{ column: "success_count" },
				{ column: "failure_count" },
				{ column: "last_used_at" },
			],
			where,
		});
	}

	compileArgumentAggregateQuery(input: {
		commandId: string;
		argumentIndex: number;
		prefix?: string;
	}): CompiledQuery {
		const targetCmd = input.commandId.toLowerCase().replace(/^[:^]/, "");
		const where = [
			{ column: "command_id", op: "eq" as const, value: targetCmd },
			{
				column: "argument_index",
				op: "eq" as const,
				value: input.argumentIndex,
			},
			...(input.prefix
				? [
						{
							column: "argument_value",
							op: "starts_with" as const,
							value: input.prefix,
						},
					]
				: []),
		];
		return this.compiler.compileSelect({
			table: "command_history_argument_aggregates",
			select: [
				{ column: "argument_value" },
				{ column: "scope" },
				{ column: "scope_key" },
				{ column: "use_count" },
				{ column: "last_used_at" },
			],
			where,
		});
	}
}
