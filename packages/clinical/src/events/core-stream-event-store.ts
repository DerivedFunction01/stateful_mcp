import type { EventRecord, EventStore } from "@stateful-mcp/core";
import type {
	StreamAppendRequest,
	StreamDecodeContext,
	StreamEventCodec,
	StreamEventMetadata,
	StreamEventRecord,
	StreamEventStore,
	StreamMergeConflict,
	StreamMergeResult,
	StreamPatchTarget,
} from "./stream-event-store";

export class CoreStreamEventStore<
	TEvent,
	TRecord extends StreamEventRecord<TEvent>,
> implements StreamEventStore<TEvent, TRecord>
{
	constructor(
		private readonly eventStore: EventStore,
		private readonly codec: StreamEventCodec<TEvent, TRecord>,
	) {
		if (!this.eventStore.schemas.has(codec.schemaName)) {
			this.eventStore.schemas.set(codec.schemaName, {
				type: "object",
				additionalProperties: true,
			});
		}
	}

	async initialize(
		streamId: string,
		sessionId: string,
		event: TEvent,
		metadata?: StreamEventMetadata,
	): Promise<{ commitId: string; records: TRecord[] }> {
		const alias = await this.eventStore.init(
			this.codec.schemaName,
			sessionId,
			streamId,
			[this.codec.encode(event, metadata)],
		);
		const commitId = await this.actualCommitId(alias, sessionId);
		return {
			commitId,
			records: await this.project(streamId, sessionId, commitId),
		};
	}

	async append(
		request: StreamAppendRequest<TEvent>,
	): Promise<{ commitId: string; records: TRecord[] }> {
		if (!request.events.length)
			return { commitId: request.parentCommitId, records: [] };
		const result = await this.eventStore.appendBatch(
			request.sessionId,
			request.parentCommitId,
			request.events.map((event) =>
				this.codec.encode(event, {
					transactionId: request.transactionId,
					idempotencyKey: request.idempotencyKey,
				}),
			),
			undefined,
			request.idempotencyKey,
		);
		const commitId = await this.actualCommitId(
			result.commitId,
			request.sessionId,
		);
		return {
			commitId,
			records: result.eventIds
				.map((eventId, index) =>
					this.decode(
						{
							event_id: eventId,
							...this.codec.encode(request.events[index]!, {
								transactionId: request.transactionId,
								idempotencyKey: request.idempotencyKey,
							}),
						},
						request.streamId,
						commitId,
						request.parentCommitId,
					),
				)
				.filter((record): record is TRecord => Boolean(record)),
		};
	}

	async project(
		streamId: string,
		sessionId: string,
		commitId: string,
	): Promise<TRecord[]> {
		const commit = await this.eventStore.getCommit(commitId, sessionId);
		const metadata = await this.mutationMetadata(commitId, sessionId);
		return (await this.eventStore.project(commitId, sessionId))
			.map((record) =>
				this.decode(
					record,
					streamId,
					commitId,
					commit?.parentCommitId ?? null,
					metadata.get(record.event_id),
				),
			)
			.filter((record): record is TRecord => Boolean(record));
	}

	async patch(
		target: StreamPatchTarget,
		patch: Record<string, unknown>,
	): Promise<{ commitId: string; eventId: string }> {
		const records = await this.project(
			target.streamId,
			target.sessionId,
			target.expectedHead,
		);
		const record = records.find(
			(item) =>
				item.eventId === target.originatingEventId ||
				this.codec.logicalKey?.(item.payload) === target.logicalRecordKey,
		);
		if (!record)
			throw new Error(
				`Stream record '${target.logicalRecordKey}' was not found at head '${target.expectedHead}'`,
			);
		const commit = await this.eventStore.patch(
			target.sessionId,
			target.expectedHead,
			record.eventId,
			{
				...patch,
				_v2PatchTarget: target,
			},
		);
		return {
			commitId: await this.actualCommitId(commit, target.sessionId),
			eventId: record.eventId,
		};
	}

	async merge(
		sessionId: string,
		targetCommitId: string,
		sourceCommitIds: readonly string[],
	): Promise<StreamMergeResult<TEvent>> {
		const result = await this.eventStore.merge(
			sessionId,
			[...sourceCommitIds],
			targetCommitId,
		);
		return {
			status: result.status,
			commitId: result.commit_id,
			mergeSessionId: result.merge_session_id,
			conflicts: result.conflicts as
				| readonly StreamMergeConflict<TEvent>[]
				| undefined,
		};
	}

	inspectMerge(mergeSessionId: string): Promise<unknown> {
		return this.eventStore.mergeInspect(mergeSessionId);
	}

	resolveMerge(
		mergeSessionId: string,
		eventId: string,
		resolution: unknown,
	): Promise<string> {
		return this.eventStore.mergeResolve(mergeSessionId, eventId, resolution);
	}

	async commitMerge(
		mergeSessionId: string,
		sessionId: string,
	): Promise<{ commitId: string }> {
		return {
			commitId: await this.eventStore.mergeCommit(mergeSessionId, sessionId),
		};
	}

	private decode(
		record: EventRecord,
		streamId: string,
		commitId: string,
		parentCommitId: string | null,
		mutation?: StreamDecodeContext["mutation"],
	): TRecord | null {
		return this.codec.decode(record as Record<string, unknown>, {
			streamId,
			commitId,
			parentCommitId,
			mutation,
		});
	}

	private async actualCommitId(
		commitIdOrAlias: string,
		sessionId: string,
	): Promise<string> {
		return (
			(await this.eventStore.getCommit(commitIdOrAlias, sessionId))?.commitId ??
			commitIdOrAlias
		);
	}

	private async mutationMetadata(
		commitId: string,
		sessionId: string,
	): Promise<Map<string, StreamDecodeContext["mutation"]>> {
		const commits: Array<{
			parentCommitId: string | null;
			mutations: readonly {
				type: "add" | "update" | "remove";
				event_id: string;
				mutation_parent_ids?: string[];
				before_data?: Record<string, unknown>;
			}[];
		}> = [];
		let current: string | null = commitId;
		while (current) {
			const commit = await this.eventStore.getCommit(current, sessionId);
			if (!commit) break;
			commits.unshift(commit);
			current = commit.parentCommitId;
		}
		const result = new Map<string, StreamDecodeContext["mutation"]>();
		for (const commit of commits)
			for (const mutation of commit.mutations)
				result.set(mutation.event_id, {
					type: mutation.type,
					mutationParentIds: mutation.mutation_parent_ids,
					beforeData: mutation.before_data,
				});
		return result;
	}
}
