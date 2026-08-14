import {
	HistoryConflictError,
	type HistoryEvent,
	type HistoryReadOptions,
	type HistoryReadResult,
	type HistoryRecoveryDiagnostic,
	type HistoryStore,
} from "./contracts";

export abstract class ValidatingHistoryStore<TPayload = unknown>
	implements HistoryStore<TPayload>
{
	protected readonly streams = new Map<string, HistoryEvent<TPayload>[]>();
	protected readonly diagnostics: HistoryRecoveryDiagnostic[] = [];
	private readonly appendQueues = new Map<string, Promise<unknown>>();

	async append(
		streamId: string,
		event: Omit<HistoryEvent<TPayload>, "sequence">,
		expectedNextSequence?: number,
	): Promise<HistoryEvent<TPayload>> {
		await this.ensureLoaded();
		const previous = this.appendQueues.get(streamId) ?? Promise.resolve();
		const operation = previous.then(async () => {
			const events = this.streams.get(streamId) ?? [];
			const existing = events.find((item) => item.eventId === event.eventId);
			if (existing) {
				if (sameEventIdentity(existing, event)) return clone(existing);
				const diagnostic = eventIdConflict(existing, event);
				this.diagnostics.push(diagnostic);
				throw new HistoryConflictError(diagnostic.message, {
					eventId: event.eventId,
					streamId,
				});
			}
			const nextSequence = nextSequenceFor(events);
			if (
				expectedNextSequence !== undefined &&
				expectedNextSequence !== nextSequence
			) {
				throw new HistoryConflictError(
					`Expected next sequence ${expectedNextSequence} for '${streamId}', actual next sequence is ${nextSequence}`,
					{ streamId, expectedNextSequence, actualNextSequence: nextSequence },
				);
			}
			if (event.streamId !== streamId)
				throw new HistoryConflictError(
					`Event '${event.eventId}' belongs to stream '${event.streamId}', not '${streamId}'`,
					{ streamId, eventStreamId: event.streamId },
				);
			const created = clone({ ...event, sequence: nextSequence });
			this.streams.set(streamId, [...events, created]);
			await this.persist();
			return clone(created);
		});
		this.appendQueues.set(streamId, operation);
		try {
			return await operation;
		} finally {
			if (this.appendQueues.get(streamId) === operation)
				this.appendQueues.delete(streamId);
		}
	}

	async read(
		streamId: string,
		options: HistoryReadOptions = {},
	): Promise<HistoryReadResult<TPayload>> {
		await this.ensureLoaded();
		const all = [...(this.streams.get(streamId) ?? [])].sort(
			(left, right) => left.sequence - right.sequence,
		);
		const diagnostics = this.diagnosticsFor(streamId);
		const filtered = all.filter(
			(item) =>
				(options.afterSequence === undefined ||
					item.sequence > options.afterSequence) &&
				(options.throughSequence === undefined ||
					item.sequence <= options.throughSequence),
		);
		const limited =
			options.limit === undefined
				? filtered
				: filtered.slice(0, Math.max(0, options.limit));
		return {
			events: limited.map(clone),
			nextSequence: nextSequenceFor(all),
			diagnostics,
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

	protected diagnosticsFor(streamId?: string): HistoryRecoveryDiagnostic[] {
		void streamId;
		return this.diagnostics.map((item) => ({ ...item }));
	}

	protected abstract ensureLoaded(): Promise<void>;
	protected abstract persist(): Promise<void>;

	protected replaceStreams(
		streams: Map<string, HistoryEvent<TPayload>[]>,
		diagnostics: HistoryRecoveryDiagnostic[] = [],
	): void {
		this.streams.clear();
		for (const [streamId, events] of streams)
			this.streams.set(streamId, events.map(clone));
		this.diagnostics.length = 0;
		this.diagnostics.push(...diagnostics);
	}
}

export function validateHistoryEvents<TPayload>(
	events: readonly HistoryEvent<TPayload>[],
	lineOffset = 0,
): HistoryRecoveryDiagnostic[] {
	const diagnostics: HistoryRecoveryDiagnostic[] = [];
	const byStream = new Map<string, HistoryEvent<TPayload>[]>();
	const ids = new Map<string, HistoryEvent<TPayload>>();
	for (const event of events) {
		const stream = byStream.get(event.streamId) ?? [];
		stream.push(event);
		byStream.set(event.streamId, stream);
		const previous = ids.get(event.eventId);
		if (previous && !sameEventIdentity(previous, event))
			diagnostics.push({
				code: "HISTORY_EVENT_ID_CONFLICT",
				message: `Event ID '${event.eventId}' has conflicting records`,
				line: lineOffset,
				sequence: event.sequence,
				recoverable: false,
			});
		else ids.set(event.eventId, event);
	}
	for (const [streamId, stream] of byStream) {
		const sorted = [...stream].sort(
			(left, right) => left.sequence - right.sequence,
		);
		let expected = 1;
		for (const event of sorted) {
			if (event.sequence === expected) expected += 1;
			else if (event.sequence < expected)
				diagnostics.push({
					code: "HISTORY_DUPLICATE_SEQUENCE",
					message: `Stream '${streamId}' contains duplicate sequence ${event.sequence}`,
					line: lineOffset,
					sequence: event.sequence,
					recoverable: false,
				});
			else {
				diagnostics.push({
					code: "HISTORY_SEQUENCE_GAP",
					message: `Stream '${streamId}' is missing sequence ${expected} before ${event.sequence}`,
					line: lineOffset,
					sequence: event.sequence,
					recoverable: false,
				});
				expected = event.sequence + 1;
			}
		}
	}
	return diagnostics;
}

export function nextSequenceFor<TPayload>(
	events: readonly HistoryEvent<TPayload>[],
): number {
	return Math.max(0, ...events.map((event) => event.sequence)) + 1;
}

export function sameEventIdentity<TPayload>(
	left: HistoryEvent<TPayload>,
	right: Omit<HistoryEvent<TPayload>, "sequence"> | HistoryEvent<TPayload>,
): boolean {
	return (
		left.streamId === right.streamId &&
		left.eventType === right.eventType &&
		left.occurredAt === right.occurredAt &&
		stableJson(left.payload) === stableJson(right.payload) &&
		stableJson(left.metadata) === stableJson(right.metadata)
	);
}

function eventIdConflict<TPayload>(
	left: HistoryEvent<TPayload>,
	right: Omit<HistoryEvent<TPayload>, "sequence">,
): HistoryRecoveryDiagnostic {
	return {
		code: "HISTORY_EVENT_ID_CONFLICT",
		message: `Event ID '${right.eventId}' already exists with different content`,
		sequence: left.sequence,
		recoverable: false,
	};
}

export function stableJson(value: unknown): string {
	return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, sortJson(item)]),
	);
}

function clone<T>(value: T): T {
	return structuredClone(value);
}
