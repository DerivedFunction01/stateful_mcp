import type { SqlExecutor } from "../../adapters/storage/generic/SqlExecutor";
import type { QueryCondition } from "../../translation/sql-compiler";
import {
	HistoryConflictError,
	type HistoryEvent,
	type HistoryReadOptions,
	type HistoryReadResult,
	type HistoryRecoveryDiagnostic,
	type HistoryStore,
} from "./contracts";
import { sameEventIdentity, validateHistoryEvents } from "./history-store";

export interface SqlHistoryStoreOptions {
	table?: string;
}

/** SQL-backed HistoryStore with SQL cursor/filter pushdown. */
export class SqlHistoryStore<TPayload = unknown>
	implements HistoryStore<TPayload>
{
	private readonly table: string;
	private readonly ready: Promise<void>;
	private writeTail: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly executor: SqlExecutor,
		options: SqlHistoryStoreOptions = {},
	) {
		this.table = assertIdentifier(options.table ?? "history_events");
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const compiler = this.executor.compiler;
		const table = compiler.compileCreateTable({
			table: this.table,
			columns: [
				{ name: "event_id", type: "id", primaryKey: true },
				{ name: "stream_id", type: "text", nullable: false },
				{ name: "sequence", type: "int", nullable: false },
				{ name: "event_type", type: "text", nullable: false },
				{ name: "occurred_at", type: "timestamp", nullable: false },
				{ name: "payload", type: "json", nullable: false },
				{ name: "metadata", type: "json", nullable: true },
			],
			uniques: [["stream_id", "sequence"]],
		});
		const index = compiler.compileCreateIndex({
			table: this.table,
			name: `${this.table}_stream_sequence`,
			columns: ["stream_id", "sequence"],
		});
		await this.executor.exec(table.sql, table.params);
		await this.executor.exec(index.sql, index.params);
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.writeTail.then(operation, operation);
		this.writeTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	async append(
		streamId: string,
		event: Omit<HistoryEvent<TPayload>, "sequence">,
		expectedNextSequence?: number,
	): Promise<HistoryEvent<TPayload>> {
		await this.ready;
		return this.enqueue(async () => {
			if (event.streamId !== streamId)
				throw new HistoryConflictError(
					`Event '${event.eventId}' belongs to stream '${event.streamId}', not '${streamId}'`,
					{ streamId, eventStreamId: event.streamId },
				);

			const existingQuery = this.executor.compiler.compileSelect({
				table: this.table,
				where: [{ column: "event_id", op: "eq", value: event.eventId }],
				limit: 1,
			});
			const existingRow = await this.executor.queryOne(
				existingQuery.sql,
				existingQuery.params,
			);
			if (existingRow) {
				const existing = decodeRow<TPayload>(existingRow);
				if (sameEventIdentity(existing, event)) return existing;
				throw new HistoryConflictError(
					`Event '${event.eventId}' already exists with different content`,
					{ eventId: event.eventId, streamId },
				);
			}

			const nextQuery = this.executor.compiler.compileSelect({
				table: this.table,
				select: [{ column: "sequence", agg: "max", alias: "max_sequence" }],
				where: [{ column: "stream_id", op: "eq", value: streamId }],
			});
			const nextRow = await this.executor.queryOne(
				nextQuery.sql,
				nextQuery.params,
			);
			const nextSequence = Number(nextRow?.max_sequence ?? 0) + 1;
			if (
				expectedNextSequence !== undefined &&
				expectedNextSequence !== nextSequence
			)
				throw new HistoryConflictError(
					`Expected next sequence ${expectedNextSequence} for '${streamId}', actual next sequence is ${nextSequence}`,
					{ streamId, expectedNextSequence, actualNextSequence: nextSequence },
				);

			const created = { ...event, sequence: nextSequence };
			const insert = this.executor.compiler.compileInsert({
				table: this.table,
				values: {
					event_id: created.eventId,
					stream_id: created.streamId,
					sequence: created.sequence,
					event_type: created.eventType,
					occurred_at: created.occurredAt,
					payload: JSON.stringify(created.payload),
					metadata:
						created.metadata === undefined
							? null
							: JSON.stringify(created.metadata),
				},
			});
			await this.executor.exec(insert.sql, insert.params);
			return structuredClone(created);
		});
	}

	async read(
		streamId: string,
		options: HistoryReadOptions = {},
	): Promise<HistoryReadResult<TPayload>> {
		await this.ready;
		const where: QueryCondition[] = [
			{ column: "stream_id", op: "eq", value: streamId },
		];
		if (options.afterSequence !== undefined)
			where.push({
				column: "sequence",
				op: "gt",
				value: options.afterSequence,
			});
		if (options.throughSequence !== undefined)
			where.push({
				column: "sequence",
				op: "leq",
				value: options.throughSequence,
			});
		const query = this.executor.compiler.compileSelect({
			table: this.table,
			where,
			orderBy: [{ column: "sequence", direction: "ASC" }],
			limit:
				options.limit === undefined ? undefined : Math.max(0, options.limit),
		});
		const rows = await this.executor.query(query.sql, query.params);
		const events = rows.map((row) => decodeRow<TPayload>(row));
		const latestQuery = this.executor.compiler.compileSelect({
			table: this.table,
			select: [{ column: "sequence", agg: "max", alias: "max_sequence" }],
			where: [{ column: "stream_id", op: "eq", value: streamId }],
		});
		const latest = await this.executor.queryOne(
			latestQuery.sql,
			latestQuery.params,
		);
		return {
			events,
			nextSequence: Number(latest?.max_sequence ?? 0) + 1,
			diagnostics: validateHistoryEvents(events),
		};
	}

	async latest(streamId: string): Promise<HistoryEvent<TPayload> | undefined> {
		await this.ready;
		const query = this.executor.compiler.compileSelect({
			table: this.table,
			where: [{ column: "stream_id", op: "eq", value: streamId }],
			orderBy: [{ column: "sequence", direction: "DESC" }],
			limit: 1,
		});
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? decodeRow<TPayload>(row) : undefined;
	}

	async recover(streamId?: string): Promise<HistoryRecoveryDiagnostic[]> {
		await this.ready;
		const query = this.executor.compiler.compileSelect({
			table: this.table,
			where:
				streamId === undefined
					? undefined
					: [{ column: "stream_id", op: "eq", value: streamId }],
		});
		const rows = await this.executor.query(query.sql, query.params);
		return validateHistoryEvents(rows.map((row) => decodeRow<TPayload>(row)));
	}
}

function decodeRow<TPayload>(row: Record<string, any>): HistoryEvent<TPayload> {
	return {
		eventId: String(row.event_id),
		streamId: String(row.stream_id),
		sequence: Number(row.sequence),
		eventType: String(row.event_type),
		occurredAt: String(row.occurred_at),
		payload: parseJsonValue(row.payload) as TPayload,
		metadata:
			row.metadata === null || row.metadata === undefined
				? undefined
				: (parseJsonValue(row.metadata) as Record<string, unknown>),
	};
}

function parseJsonValue(value: unknown): unknown {
	if (typeof value !== "string") return structuredClone(value);
	return JSON.parse(value);
}

function assertIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
		throw new Error(`Invalid history table identifier '${value}'`);
	return value;
}
