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

import type { HistoryPruningConfig } from "./command-history";

export class SqlCommandHistoryStore implements CommandHistoryStore {
	private readonly compiler: CommandHistoryQueryCompiler;
	private readonly table = "command_history_events";
	private readonly ready: Promise<void>;
	private readonly pruningConfig?: HistoryPruningConfig;

	constructor(
		private readonly dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		pruningConfig?: HistoryPruningConfig,
	) {
		this.pruningConfig = pruningConfig;
		this.compiler = new CommandHistoryQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table))
			await this.executor.exec(query.sql, query.params);
	}

	private async consolidateAndPrune(): Promise<void> {
		if (!this.pruningConfig) return;
		const countQuery = this.compiler.compileCount(this.table);
		const countRows = await this.executor.query(countQuery.sql, countQuery.params);
		const total = Number(countRows[0]?.count ?? 0);
		if (total <= this.pruningConfig.maxHistoryRows) return;

		const batchSize = this.pruningConfig.pruneBatchSize;
		const pruneSelectQuery = this.compiler.compilePruneSelect(this.table, batchSize);
		const oldEvents = await this.executor.query(
			pruneSelectQuery.sql,
			pruneSelectQuery.params
		);
		if (oldEvents.length === 0) return;

		const eventIds = oldEvents.map((r: any) => String(r.event_id));

		for (const ev of oldEvents) {
			const isSuccess = ev.outcome === "success" ? 1 : 0;
			const isFailure = ev.outcome === "failure" ? 1 : 0;
			const upsertQuery = this.compiler.compileUpsertCommandAggregate(
				ev.command_text,
				ev.scope,
				ev.scope_key,
				ev.canonical_verb ?? null,
				ev.command_id ?? null,
				isSuccess,
				isFailure,
				ev.executed_at
			);
			await this.executor.exec(upsertQuery.sql, upsertQuery.params);

			const getArgsQuery = this.compiler.compileGetArguments([ev.event_id]);
			const args = await this.executor.query(getArgsQuery.sql, getArgsQuery.params);
			for (const arg of args) {
				const upsertArgQuery = this.compiler.compileUpsertArgumentAggregate(
					ev.command_id ?? ev.canonical_verb ?? "unknown",
					Number(arg.argument_index),
					arg.argument_name ?? null,
					arg.argument_value,
					ev.scope,
					ev.scope_key,
					1,
					ev.executed_at
				);
				await this.executor.exec(upsertArgQuery.sql, upsertArgQuery.params);
			}
		}

		const deleteArgsQuery = this.compiler.compileDelete("command_history_arguments", eventIds);
		const deleteEventsQuery = this.compiler.compileDelete(this.table, eventIds);
		await this.executor.exec(deleteArgsQuery.sql, deleteArgsQuery.params);
		await this.executor.exec(deleteEventsQuery.sql, deleteEventsQuery.params);
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
		if (this.pruningConfig) {
			await this.consolidateAndPrune();
		}
	}

	async query(input: CommandHistoryQuery): Promise<CommandHistoryCandidate[]> {
		await this.ready;
		const query = this.compiler.compileQuery(this.table, input);
		const rows = await this.executor.query(query.sql, query.params);

		const aggQuery = this.compiler.compileAggregateQuery(input);
		const aggRows = await this.executor.query(aggQuery.sql, aggQuery.params);

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
				current.sessionLastUsedAt = current.sessionLastUsedAt
					? (row.executed_at > current.sessionLastUsedAt ? row.executed_at : current.sessionLastUsedAt)
					: row.executed_at as string;
			} else {
				current.allCount += 1;
				current.allLastUsedAt = current.allLastUsedAt
					? (row.executed_at > current.allLastUsedAt ? row.executed_at : current.allLastUsedAt)
					: row.executed_at as string;
			}
			candidates.set(commandText, current);
		}

		for (const row of aggRows) {
			const commandText = String(row.command_text);
			const current = candidates.get(commandText) ?? {
				commandText,
				canonicalVerb: row.canonical_verb as string | undefined,
				commandId: row.command_id as string | undefined,
				sessionCount: 0,
				allCount: 0,
			};
			const total = Number(row.success_count ?? 0) + Number(row.failure_count ?? 0);
			if (row.scope === "session") {
				current.sessionCount += total;
				current.sessionLastUsedAt = current.sessionLastUsedAt
					? (row.last_used_at > current.sessionLastUsedAt ? row.last_used_at : current.sessionLastUsedAt)
					: row.last_used_at as string;
			} else {
				current.allCount += total;
				current.allLastUsedAt = current.allLastUsedAt
					? (row.last_used_at > current.allLastUsedAt ? row.last_used_at : current.allLastUsedAt)
					: row.last_used_at as string;
			}
			candidates.set(commandText, current);
		}

		return [...candidates.values()]
			.sort((a, b) => {
				const countA = a.sessionCount + a.allCount;
				const countB = b.sessionCount + b.allCount;
				if (countB !== countA) return countB - countA;
				const timeA = a.sessionLastUsedAt || a.allLastUsedAt || "";
				const timeB = b.sessionLastUsedAt || b.allLastUsedAt || "";
				return timeB.localeCompare(timeA);
			})
			.slice(0, input.limit ?? 50);
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
		`;

		if (this.dialect === "postgres") {
			let paramIndex = 1;
			sql = sql.replace(/\?/g, () => `$${paramIndex++}`);
		}

		const rows = await this.executor.query(sql, params);

		let aggRows: any[] = [];
		if (!input.priorArguments || input.priorArguments.length === 0) {
			const aggQuery = this.compiler.compileArgumentAggregateQuery({
				commandId: input.commandId,
				argumentIndex: input.argumentIndex,
				prefix: input.prefix,
			});
			aggRows = await this.executor.query(aggQuery.sql, aggQuery.params);
		}

		const usageMap = new Map<string, ArgumentUsageRecord>();
		for (const row of rows) {
			const val = String(row.argument_value);
			usageMap.set(val, {
				commandId: input.commandId,
				argumentIndex: input.argumentIndex,
				argumentValue: val,
				sessionCount: Number(row.session_count),
				allCount: Number(row.all_count),
				sessionLastUsedAt: row.session_last_used_at ? String(row.session_last_used_at) : undefined,
				allLastUsedAt: row.all_last_used_at ? String(row.all_last_used_at) : undefined,
			});
		}

		for (const row of aggRows) {
			const val = String(row.argument_value);
			const count = Number(row.use_count ?? 0);
			const existing = usageMap.get(val) ?? {
				commandId: input.commandId,
				argumentIndex: input.argumentIndex,
				argumentValue: val,
				sessionCount: 0,
				allCount: 0,
			};
			if (row.scope === "session" && row.scope_key === input.sessionId) {
				existing.sessionCount += count;
				existing.sessionLastUsedAt = existing.sessionLastUsedAt
					? (row.last_used_at > existing.sessionLastUsedAt ? row.last_used_at : existing.sessionLastUsedAt)
					: row.last_used_at ? String(row.last_used_at) : undefined;
			} else {
				existing.allCount += count;
				existing.allLastUsedAt = existing.allLastUsedAt
					? (row.last_used_at > existing.allLastUsedAt ? row.last_used_at : existing.allLastUsedAt)
					: row.last_used_at ? String(row.last_used_at) : undefined;
			}
			usageMap.set(val, existing);
		}

		return [...usageMap.values()]
			.sort((a, b) => {
				const countA = a.sessionCount + a.allCount;
				const countB = b.sessionCount + b.allCount;
				if (countB !== countA) return countB - countA;
				const timeA = a.sessionLastUsedAt || a.allLastUsedAt || "";
				const timeB = b.sessionLastUsedAt || b.allLastUsedAt || "";
				return timeB.localeCompare(timeA);
			})
			.slice(0, input.limit ?? 50);
	}
}
