import type {
	WorkspaceEvent,
	WorkspaceEventRecord,
} from "./workspace-event-types";

export interface WorkspaceEventStore {
	initialize(
		workspaceId: string,
		sessionId: string,
		event: WorkspaceEvent,
	): Promise<{ commitId: string; records: WorkspaceEventRecord[] }>;
	append(
		workspaceId: string,
		sessionId: string,
		parentCommitId: string,
		events: readonly WorkspaceEvent[],
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<{ commitId: string; records: WorkspaceEventRecord[] }>;
	project(
		workspaceId: string,
		sessionId: string,
		commitId: string,
	): Promise<WorkspaceEventRecord[]>;
	merge(
		sessionId: string,
		targetCommitId: string,
		sourceCommitIds: readonly string[],
	): Promise<WorkspaceMergeResult>;
	voidEvent(
		workspaceId: string,
		sessionId: string,
		headCommitId: string,
		eventId: string,
		reason: string,
		actorId?: string,
	): Promise<{ commitId: string; eventId: string }>;
}

export interface WorkspaceMergeResult {
	status: "clean" | "conflict";
	commitId?: string;
	mergeSessionId?: string;
	conflicts?: readonly WorkspaceMergeConflict[];
}

export interface WorkspaceMergeConflict {
	logicalKey: string;
	targetEvent: WorkspaceEventRecord;
	sourceEvents: readonly WorkspaceEventRecord[];
}
