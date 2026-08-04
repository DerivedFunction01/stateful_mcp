import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import {
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
		dialect: SqlDialect,
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
			};
			const query = this.compiler.compileInsert(this.table, { ...event });
			await this.executor.exec(query.sql, query.params);
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
}
