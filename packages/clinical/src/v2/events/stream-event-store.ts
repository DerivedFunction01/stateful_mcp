export interface StreamEventRecord<TEvent> {
	eventId: string;
	streamId: string;
	commitId: string;
	parentCommitId: string | null;
	payload: TEvent;
	mutationType?: "add" | "update" | "remove";
	mutationParentIds?: string[];
	beforeData?: Record<string, unknown>;
	voided?: boolean;
	voidReason?: string;
	voidedBy?: string;
	voidedAt?: string;
}

export interface StreamAppendRequest<TEvent> {
	streamId: string;
	sessionId: string;
	parentCommitId: string;
	events: readonly TEvent[];
	transactionId?: string;
	idempotencyKey?: string;
}

export interface StreamPatchTarget {
	streamKind: string;
	streamId: string;
	sessionId: string;
	logicalRecordKey: string;
	originatingEventId?: string;
	expectedHead: string;
	sourceCellId?: string;
	sourceCellRevision?: number;
	transactionId?: string;
	operationId?: string;
}

export interface StreamMergeConflict<TEvent> {
	logicalKey: string;
	targetEvent?: StreamEventRecord<TEvent>;
	sourceEvents: readonly StreamEventRecord<TEvent>[];
}

export interface StreamMergeResult<TEvent> {
	status: "clean" | "conflict";
	commitId?: string;
	mergeSessionId?: string;
	conflicts?: readonly StreamMergeConflict<TEvent>[];
}

export interface StreamEventCodec<
	TEvent,
	TRecord extends StreamEventRecord<TEvent>,
> {
	schemaName: string;
	encode(
		event: TEvent,
		metadata?: StreamEventMetadata,
	): Record<string, unknown>;
	decode(
		record: Record<string, unknown>,
		context: StreamDecodeContext,
	): TRecord | null;
	logicalKey?(event: TEvent): string | null;
}

export interface StreamEventMetadata {
	logicalRecordKey?: string;
	operationId?: string;
	actorId?: string;
	authorId?: string;
	sourceCellId?: string;
	transactionId?: string;
	idempotencyKey?: string;
	scope?: { level: "global" | "session" | "user"; userId?: string };
}

export interface StreamDecodeContext {
	streamId: string;
	commitId: string;
	parentCommitId: string | null;
	mutation?: {
		type: "add" | "update" | "remove";
		mutationParentIds?: string[];
		beforeData?: Record<string, unknown>;
	};
}

export interface StreamEventStore<
	TEvent,
	TRecord extends StreamEventRecord<TEvent>,
> {
	initialize(
		streamId: string,
		sessionId: string,
		event: TEvent,
		metadata?: StreamEventMetadata,
	): Promise<{ commitId: string; records: TRecord[] }>;
	append(
		request: StreamAppendRequest<TEvent>,
	): Promise<{ commitId: string; records: TRecord[] }>;
	project(
		streamId: string,
		sessionId: string,
		commitId: string,
	): Promise<TRecord[]>;
	patch(
		target: StreamPatchTarget,
		patch: Record<string, unknown>,
	): Promise<{ commitId: string; eventId: string }>;
	merge(
		sessionId: string,
		targetCommitId: string,
		sourceCommitIds: readonly string[],
	): Promise<StreamMergeResult<TEvent>>;
	inspectMerge(mergeSessionId: string): Promise<unknown>;
	resolveMerge(
		mergeSessionId: string,
		eventId: string,
		resolution: unknown,
	): Promise<string>;
	commitMerge(
		mergeSessionId: string,
		sessionId: string,
	): Promise<{ commitId: string }>;
}
