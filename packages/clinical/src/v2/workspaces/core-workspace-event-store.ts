import type { EventRecord, EventStore } from "@stateful-mcp/core";
import type {
	WorkspaceEventStore,
	WorkspaceMergeConflict,
	WorkspaceMergeResult,
} from "./workspace-event-store";
import type {
	WorkspaceEvent,
	WorkspaceEventRecord,
} from "./workspace-event-types";

const SCHEMA_NAME = "v2_workspace_events";

export class CoreWorkspaceEventStore implements WorkspaceEventStore {
	constructor(private readonly eventStore: EventStore) {
		if (!this.eventStore.schemas.has(SCHEMA_NAME)) {
			this.eventStore.schemas.set(SCHEMA_NAME, {
				type: "object",
				additionalProperties: true,
			});
		}
	}

	async initialize(
		workspaceId: string,
		sessionId: string,
		event: WorkspaceEvent,
	): Promise<{ commitId: string; records: WorkspaceEventRecord[] }> {
		const resolvedCommitId = await this.eventStore.init(
			SCHEMA_NAME,
			sessionId,
			workspaceId,
			[this.encode(event)],
		);
		const commitId = await this.actualCommitId(resolvedCommitId, sessionId);
		return {
			commitId,
			records: await this.project(workspaceId, sessionId, commitId),
		};
	}

	async append(
		workspaceId: string,
		sessionId: string,
		parentCommitId: string,
		events: readonly WorkspaceEvent[],
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<{ commitId: string; records: WorkspaceEventRecord[] }> {
		if (!events.length) return { commitId: parentCommitId, records: [] };
		const encoded = events.map((event) =>
			this.encode(event, transactionId, idempotencyKey),
		);
		const result = await this.eventStore.appendBatch(
			sessionId,
			parentCommitId,
			encoded,
			undefined,
			idempotencyKey,
		);
		const commitId = await this.actualCommitId(result.commitId, sessionId);
		return {
			commitId,
			records: result.eventIds.map((eventId, index) => ({
				eventId,
				workspaceId,
				commitId,
				parentCommitId,
				payload: events[index]!,
			})),
		};
	}

	async project(
		workspaceId: string,
		sessionId: string,
		commitId: string,
	): Promise<WorkspaceEventRecord[]> {
		const commit = await this.eventStore.getCommit(commitId, sessionId);
		const projected = await this.eventStore.project(commitId, sessionId);
		const mutationMetadata = await this.mutationMetadata(commitId, sessionId);
		return projected
			.map((record) =>
				this.decode(
					record,
					workspaceId,
					commitId,
					commit?.parentCommitId ?? null,
					mutationMetadata.get(record.event_id),
				),
			)
			.filter((record): record is WorkspaceEventRecord => Boolean(record));
	}

	async merge(
		sessionId: string,
		targetCommitId: string,
		sourceCommitIds: readonly string[],
	): Promise<WorkspaceMergeResult> {
		const lca = await this.eventStore.findLCA(
			[targetCommitId, ...sourceCommitIds],
			sessionId,
		);
		const targetHistory = await this.historyAfter(
			targetCommitId,
			lca,
			sessionId,
		);
		const sourceHistories = await Promise.all(
			sourceCommitIds.map((commitId) =>
				this.historyAfter(commitId, lca, sessionId),
			),
		);
		const targetByKey = new Map<string, WorkspaceEventRecord>();
		for (const record of targetHistory) {
			const key = this.logicalKey(record.payload);
			if (key) targetByKey.set(key, record);
		}
		const conflicts: WorkspaceMergeConflict[] = [];
		for (const history of sourceHistories) {
			for (const record of history) {
				const key = this.logicalKey(record.payload);
				if (!key) continue;
				const target = targetByKey.get(key);
				if (
					target &&
					JSON.stringify(target.payload) !== JSON.stringify(record.payload)
				) {
					conflicts.push({
						logicalKey: key,
						targetEvent: target,
						sourceEvents: [record],
					});
				}
			}
		}
		if (conflicts.length) {
			return {
				status: "conflict",
				mergeSessionId: `workspace_merge_${crypto.randomUUID()}`,
				conflicts,
			};
		}
		const result = await this.eventStore.merge(
			sessionId,
			[...sourceCommitIds],
			targetCommitId,
		);
		return {
			status: result.status,
			commitId: result.commit_id,
			mergeSessionId: result.merge_session_id,
			conflicts: result.conflicts as WorkspaceMergeConflict[] | undefined,
		};
	}

	async voidEvent(
		workspaceId: string,
		sessionId: string,
		headCommitId: string,
		eventId: string,
		reason: string,
		actorId?: string,
	): Promise<{ commitId: string; eventId: string }> {
		const result = await this.eventStore.patch(
			sessionId,
			headCommitId,
			eventId,
			{
				voided: true,
				voidReason: reason,
				voidedBy: actorId,
				voidedAt: new Date().toISOString(),
			},
		);
		return {
			commitId: await this.actualCommitId(result, sessionId),
			eventId,
		};
	}

	private encode(
		event: WorkspaceEvent,
		transactionId?: string,
		idempotencyKey?: string,
	): Record<string, unknown> {
		return {
			...event,
			macroBatchId: idempotencyKey,
			_v2TransactionId: transactionId,
			_v2IdempotencyKey: idempotencyKey,
		};
	}

	private decode(
		record: EventRecord,
		workspaceId: string,
		commitId: string,
		parentCommitId: string | null,
		mutation?: {
			type: "add" | "update" | "remove";
			mutationParentIds?: string[];
			beforeData?: Record<string, unknown>;
		},
	): WorkspaceEventRecord | null {
		if (record.workspaceId && record.workspaceId !== workspaceId) return null;
		const {
			event_id: eventId,
			macroBatchId: _macroBatchId,
			_v2TransactionId: _transactionId,
			_v2IdempotencyKey: _idempotencyKey,
			voided,
			voidReason,
			voidedBy,
			voidedAt,
			...payload
		} = record as EventRecord & Record<string, unknown>;
		if (typeof payload.kind !== "string") return null;
		return {
			eventId,
			workspaceId,
			commitId,
			parentCommitId,
			payload: payload as WorkspaceEvent,
			voided: voided === true,
			voidReason: typeof voidReason === "string" ? voidReason : undefined,
			voidedBy: typeof voidedBy === "string" ? voidedBy : undefined,
			voidedAt: typeof voidedAt === "string" ? voidedAt : undefined,
			mutationType: mutation?.type,
			mutationParentIds: mutation?.mutationParentIds,
			beforeData: mutation?.beforeData,
		};
	}

	private async mutationMetadata(
		commitId: string,
		sessionId: string,
	): Promise<
		Map<
			string,
			{
				type: "add" | "update" | "remove";
				mutationParentIds?: string[];
				beforeData?: Record<string, unknown>;
			}
		>
	> {
		const commits: Array<{
			commitId: string;
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
		const result = new Map<
			string,
			{
				type: "add" | "update" | "remove";
				mutationParentIds?: string[];
				beforeData?: Record<string, unknown>;
			}
		>();
		for (const commit of commits) {
			for (const mutation of commit.mutations) {
				result.set(mutation.event_id, {
					type: mutation.type,
					mutationParentIds: mutation.mutation_parent_ids,
					beforeData: mutation.before_data,
				});
			}
		}
		return result;
	}

	private async actualCommitId(
		commitIdOrAlias: string,
		sessionId: string,
	): Promise<string> {
		const commit = await this.eventStore.getCommit(commitIdOrAlias, sessionId);
		return commit?.commitId ?? commitIdOrAlias;
	}

	private async historyAfter(
		commitId: string,
		ancestorCommitId: string,
		sessionId: string,
	): Promise<WorkspaceEventRecord[]> {
		const commits: Array<{
			commitId: string;
			parentCommitId: string | null;
			mutations: readonly {
				type: string;
				event_id: string;
				data?: Record<string, unknown>;
			}[];
		}> = [];
		let current: string | null = commitId;
		while (current && current !== ancestorCommitId) {
			const commit = await this.eventStore.getCommit(current, sessionId);
			if (!commit) break;
			commits.push(commit);
			current = commit.parentCommitId;
		}
		const records: WorkspaceEventRecord[] = [];
		for (const commit of commits.reverse()) {
			for (const mutation of commit.mutations) {
				if (mutation.type !== "add" || !mutation.data) continue;
				const record = this.decode(
					{ event_id: mutation.event_id, ...mutation.data } as EventRecord,
					String(mutation.data.workspaceId ?? ""),
					commit.commitId,
					commit.parentCommitId,
				);
				if (record) records.push(record);
			}
		}
		return records;
	}

	private logicalKey(event: WorkspaceEvent): string | null {
		if (event.metadata?.logicalKey) return event.metadata.logicalKey;
		if (event.kind === "branch_lifecycle_transitioned")
			return `branch:${event.branchId}`;
		if (event.kind === "workspace_close_requested")
			return "workspace:lifecycle";
		if (event.kind === "workspace_completed") return "workspace:completion";
		if (event.kind === "concept_added" || event.kind === "global_fact_added")
			return `fact:${event.fact.factId}`;
		if (event.kind === "global_fact_removed") return `fact:${event.factId}`;
		return null;
	}
}
