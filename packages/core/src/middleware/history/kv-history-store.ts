import type { KvBackend } from "../../adapters/storage/generic/kv/KvBackend";
import {
	HistoryConflictError,
	type HistoryEvent,
	type HistoryReadOptions,
	type HistoryReadResult,
	type HistoryRecoveryDiagnostic,
	type HistoryStore,
} from "./contracts";
import { sameEventIdentity } from "./history-store";

const PREFIX = "__stateful_history__:";

/**
 * HistoryStore backed by the repository's generic KV contract.
 *
 * The store owns stream sequencing, identity, cursor filtering, and the write
 * queue. The KV backend only provides durable key/value storage.
 */
export class KvHistoryStore<TPayload = unknown>
	implements HistoryStore<TPayload>
{
	private data: Record<string, unknown> | null = null;
	private writeTail: Promise<unknown> = Promise.resolve();
	private diagnostics: HistoryRecoveryDiagnostic[] = [];

	constructor(
		private readonly backend: KvBackend,
		private readonly namespace = "default",
	) {}

	private key(event: HistoryEvent<TPayload>): string {
		return `${PREFIX}${this.namespace}:${event.streamId}:${event.sequence}`;
	}

	private async ensureLoaded(): Promise<Record<string, unknown>> {
		if (this.data === null) this.data = await this.backend.load();
		return this.data;
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.writeTail.then(operation, operation);
		this.writeTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	private events(): HistoryEvent<TPayload>[] {
		return Object.entries(this.data ?? {})
			.filter(([key]) => key.startsWith(`${PREFIX}${this.namespace}:`))
			.map(([, value]) => value)
			.filter(isHistoryEvent<TPayload>)
			.map(clone);
	}

	async append(
		streamId: string,
		event: Omit<HistoryEvent<TPayload>, "sequence">,
		expectedNextSequence?: number,
	): Promise<HistoryEvent<TPayload>> {
		return this.enqueue(async () => {
			const data = await this.ensureLoaded();
			if (event.streamId !== streamId)
				throw new HistoryConflictError(
					`Event '${event.eventId}' belongs to stream '${event.streamId}', not '${streamId}'`,
					{ streamId, eventStreamId: event.streamId },
				);

			const events = this.events();
			const existing = events.find((item) => item.eventId === event.eventId);
			if (existing) {
				if (sameEventIdentity(existing, event)) return existing;
				throw new HistoryConflictError(
					`Event '${event.eventId}' already exists with different content`,
					{ eventId: event.eventId, streamId },
				);
			}

			const nextSequence = nextSequenceFor(
				events.filter((item) => item.streamId === streamId),
			);
			if (
				expectedNextSequence !== undefined &&
				expectedNextSequence !== nextSequence
			)
				throw new HistoryConflictError(
					`Expected next sequence ${expectedNextSequence} for '${streamId}', actual next sequence is ${nextSequence}`,
					{ streamId, expectedNextSequence, actualNextSequence: nextSequence },
				);

			const created = clone({ ...event, sequence: nextSequence });
			data[this.key(created)] = created;
			await this.backend.set(this.key(created), created);
			return created;
		});
	}

	async read(
		streamId: string,
		options: HistoryReadOptions = {},
	): Promise<HistoryReadResult<TPayload>> {
		await this.ensureLoaded();
		const all = this.events()
			.filter((event) => event.streamId === streamId)
			.sort((left, right) => left.sequence - right.sequence);
		const filtered = all.filter(
			(event) =>
				(options.afterSequence === undefined ||
					event.sequence > options.afterSequence) &&
				(options.throughSequence === undefined ||
					event.sequence <= options.throughSequence),
		);
		return {
			events:
				options.limit === undefined
					? filtered
					: filtered.slice(0, Math.max(0, options.limit)),
			nextSequence: nextSequenceFor(all),
			diagnostics: this.diagnosticsFor(streamId),
		};
	}

	async latest(streamId: string): Promise<HistoryEvent<TPayload> | undefined> {
		const result = await this.read(streamId);
		return result.events.at(-1);
	}

	async recover(streamId?: string): Promise<HistoryRecoveryDiagnostic[]> {
		await this.ensureLoaded();
		return this.diagnosticsFor(streamId);
	}

	private diagnosticsFor(streamId?: string): HistoryRecoveryDiagnostic[] {
		void streamId;
		return this.diagnostics.map((item) => ({ ...item }));
	}
}

function nextSequenceFor<TPayload>(
	events: readonly HistoryEvent<TPayload>[],
): number {
	return Math.max(0, ...events.map((event) => event.sequence)) + 1;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function isHistoryEvent<TPayload>(
	value: unknown,
): value is HistoryEvent<TPayload> {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return (
		typeof item.eventId === "string" &&
		typeof item.streamId === "string" &&
		typeof item.sequence === "number" &&
		Number.isInteger(item.sequence) &&
		item.sequence > 0 &&
		typeof item.eventType === "string" &&
		typeof item.occurredAt === "string" &&
		"payload" in item
	);
}
