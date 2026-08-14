export interface HistoryEvent<TPayload = unknown> {
	eventId: string;
	streamId: string;
	sequence: number;
	eventType: string;
	occurredAt: string;
	payload: TPayload;
	metadata?: Record<string, unknown>;
}

export interface HistoryReadOptions {
	afterSequence?: number;
	throughSequence?: number;
	limit?: number;
}

export type HistoryDiagnosticCode =
	| "HISTORY_FILE_MISSING"
	| "HISTORY_INVALID_JSON"
	| "HISTORY_PARTIAL_RECORD"
	| "HISTORY_SEQUENCE_GAP"
	| "HISTORY_DUPLICATE_SEQUENCE"
	| "HISTORY_EVENT_ID_CONFLICT"
	| "HISTORY_VERSION_UNSUPPORTED";

export interface HistoryRecoveryDiagnostic {
	code: HistoryDiagnosticCode;
	message: string;
	line?: number;
	sequence?: number;
	recoverable: boolean;
}

export interface HistoryReadResult<TPayload> {
	events: HistoryEvent<TPayload>[];
	nextSequence: number;
	diagnostics: HistoryRecoveryDiagnostic[];
}

export interface HistoryStore<TPayload = unknown> {
	append(
		streamId: string,
		event: Omit<HistoryEvent<TPayload>, "sequence">,
		expectedNextSequence?: number,
	): Promise<HistoryEvent<TPayload>>;
	read(
		streamId: string,
		options?: HistoryReadOptions,
	): Promise<HistoryReadResult<TPayload>>;
	latest(streamId: string): Promise<HistoryEvent<TPayload> | undefined>;
	recover(streamId?: string): Promise<HistoryRecoveryDiagnostic[]>;
}

export class HistoryConflictError extends Error {
	readonly code = "HISTORY_SEQUENCE_CONFLICT";

	constructor(
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "HistoryConflictError";
	}
}

export function isHistoryEvent(value: unknown): value is HistoryEvent {
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
