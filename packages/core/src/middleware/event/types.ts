export interface EventCondition {
	property: string;
	operator: string;
	value: any;
}

export interface EventRecord {
	event_id: string;
	[key: string]: any;
}

export interface EventMutation {
	type: "add" | "update" | "remove";
	event_id: string;
	mutation_parent_ids?: string[];
	data?: Record<string, any>;
	before_data?: Record<string, any>;
}

export interface EventCommit {
	commitId: string;
	sessionId: string;
	parentCommitId: string | null;
	createdAt: string;
	operation: "add" | "update" | "remove" | "merge";
	mutations: EventMutation[];
	mergeSourceCommitIds?: string[];
	mergeAcceptedIds?: string[];
	mergeRejectedIds?: string[];
	linearDepth: number;
	gcLock: boolean;
}

export interface MergeSession {
	mergeSessionId: string;
	parentMergeSessionId: string | null;
	sourceCommitIds: string[];
	targetCommitId: string;
	conflicts: MergeConflict[];
}

export interface MergeConflict {
	event_id: string;
	source_values: Record<string, any>; // maps source commit ID to its version/data of the event
	target_value: any; // target commit's version/data of the event
	status: "pending" | "resolved";
	resolution?: {
		strategy: "accept_source" | "accept_target" | "patch";
		source_id?: string; // if accept_source, which source commit ID
		values?: Record<string, any>; // if patch, the manual resolution values
	};
}
