import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import {
	type ArgumentUsageRecord,
	type CommandHistoryCandidate,
	type CommandHistoryEvent,
	type CommandHistoryQuery,
	type CommandHistoryStore,
	normalizeCommandText,
} from "./command-history";
import { CommandHistoryQueryCompiler } from "../stores/sql/command-history-query-compiler";

export class SqlCommandHistoryStore implements CommandHistoryStore {
	private readonly compiler: CommandHistoryQueryCompiler;
	private readonly table = "command_history_events";
	private readonly ready: Promise<void>;

	constructor(
		private readonly dialect: SqlDialect,
		private readonly executor: SqlExecutor,
	) {
		this.compiler = new CommandHistoryQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table))
			await this.executor.exec(query.sql, query.params);
	}

	async recordSuccess(input: {
		sessionId: string;
		commandText: string;
		canonicalVerb?: string;
		commandId?: string;
		executedAt?: string;
		args?: Array<{
			index: number;
			name?: string;
			value: string;
			normalizedValue?: string;
		}>;
	}): Promise<void> {
		await this.ready;
		const executedAt = input.executedAt ?? new Date().toISOString();
		for (const [scope, scopeKey] of [
			["session", input.sessionId],
			["all", "all"],
		] as const) {
			const event: CommandHistoryEvent = {
				eventId: crypto.randomUUID(),
				scope,
				scopeKey,
				sessionId: input.sessionId,
				commandText: normalizeCommandText(input.commandText),
				canonicalVerb: input.canonicalVerb,
				commandId: input.commandId,
				executedAt,
				outcome: "success",
				args: input.args,
			};
			const query = this.compiler.compileInsert(this.table, {
				event_id: event.eventId,
				scope: event.scope,
				scope_key: event.scopeKey,
				session_id: event.sessionId,
				command_text: event.commandText,
				canonical_verb: event.canonicalVerb,
				command_id: event.commandId,
				executed_at: event.executedAt,
				outcome: event.outcome,
			});
			await this.executor.exec(query.sql, query.params);

			if (input.args) {
				for (const arg of input.args) {
					const argQuery = this.compiler.compileInsert("command_history_arguments", {
						event_id: event.eventId,
						argument_index: arg.index,
						argument_name: arg.name ?? null,
						argument_value: arg.value,
					});
					await this.executor.exec(argQuery.sql, argQuery.params);
				}
			}
		}
	}

	async query(input: CommandHistoryQuery): Promise<CommandHistoryCandidate[]> {
		await this.ready;
		const query = this.compiler.compileQuery(this.table, input);
		const rows = await this.executor.query(query.sql, query.params);
		const candidates = new Map<string, CommandHistoryCandidate>();
		for (const row of rows) {
			const commandText = String(row.command_text);
			const current = candidates.get(commandText) ?? {
				commandText,
				canonicalVerb: row.canonical_verb as string | undefined,
				commandId: row.command_id as string | undefined,
				sessionCount: 0,
				allCount: 0,
			};
			if (row.scope === "session") {
				current.sessionCount += 1;
				current.sessionLastUsedAt ??= row.executed_at as string;
			} else {
				current.allCount += 1;
				current.allLastUsedAt ??= row.executed_at as string;
			}
			candidates.set(commandText, current);
		}
		return [...candidates.values()].slice(0, input.limit ?? 50);
	}

	async queryArgumentUsage(input: {
		sessionId: string;
		commandId: string;
		argumentIndex: number;
		priorArguments?: string[];
		prefix?: string;
		limit?: number;
	}): Promise<ArgumentUsageRecord[]> {
		await this.ready;
		let sql = `
			SELECT 
				val.argument_value AS argument_value,
				COUNT(CASE WHEN e.scope = 'session' AND e.session_id = ? THEN 1 END) AS session_count,
				COUNT(CASE WHEN e.scope = 'all' THEN 1 END) AS all_count,
				MAX(CASE WHEN e.scope = 'session' AND e.session_id = ? THEN e.executed_at END) AS session_last_used_at,
				MAX(CASE WHEN e.scope = 'all' THEN e.executed_at END) AS all_last_used_at
			FROM command_history_events e
			JOIN command_history_arguments val ON e.event_id = val.event_id AND val.argument_index = ?
		`;

		const params: any[] = [input.sessionId, input.sessionId, input.argumentIndex];

		if (input.priorArguments && input.priorArguments.length > 0) {
			for (let i = 0; i < input.priorArguments.length; i++) {
				sql += ` JOIN command_history_arguments prior${i} ON e.event_id = prior${i}.event_id AND prior${i}.argument_index = ? AND LOWER(prior${i}.argument_value) = ? `;
				params.push(i, input.priorArguments[i]!.toLowerCase());
			}
		}

		const targetCmd = input.commandId.toLowerCase().replace(/^[:^]/, "");
		sql += ` WHERE (LOWER(e.command_id) = ? OR LOWER(e.canonical_verb) = ?) AND e.outcome = 'success' `;
		params.push(targetCmd, targetCmd);

		if (input.prefix) {
			sql += ` AND LOWER(val.argument_value) LIKE ? `;
			params.push(`${input.prefix.toLowerCase()}%`);
		}

		sql += `
			GROUP BY val.argument_value
			ORDER BY (session_count + all_count) DESC, COALESCE(session_last_used_at, all_last_used_at) DESC
			LIMIT ?
		`;
		params.push(input.limit ?? 50);

		if (this.dialect === "postgres") {
			let paramIndex = 1;
			sql = sql.replace(/\?/g, () => `$${paramIndex++}`);
		}

		const rows = await this.executor.query(sql, params);
		return rows.map((row) => ({
			commandId: input.commandId,
			argumentIndex: input.argumentIndex,
			argumentValue: String(row.argument_value),
			sessionCount: Number(row.session_count),
			allCount: Number(row.all_count),
			sessionLastUsedAt: row.session_last_used_at ? String(row.session_last_used_at) : undefined,
			allLastUsedAt: row.all_last_used_at ? String(row.all_last_used_at) : undefined,
		}));
	}
}
