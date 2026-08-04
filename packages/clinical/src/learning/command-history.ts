export type CommandHistoryScope = "session" | "all";

export interface HistoryPruningConfig {
	maxHistoryRows: number;
	pruneBatchSize: number;
}

export interface CommandHistoryEvent {
	eventId: string;
	scope: CommandHistoryScope;
	scopeKey: string;
	sessionId: string;
	commandText: string;
	canonicalVerb?: string;
	commandId?: string;
	executedAt: string;
	outcome: "success" | "failure" | "cancelled";
	args?: Array<{
		index: number;
		name?: string;
		value: string;
		normalizedValue?: string;
	}>;
}

export interface CommandHistoryCandidate {
	commandText: string;
	canonicalVerb?: string;
	commandId?: string;
	sessionCount: number;
	allCount: number;
	sessionLastUsedAt?: string;
	allLastUsedAt?: string;
}

export interface CommandHistoryQuery {
	sessionId: string;
	scope?: CommandHistoryScope | "merged";
	prefix?: string;
	limit?: number;
}

export interface ArgumentUsageRecord {
	commandId: string;
	argumentIndex: number;
	argumentValue: string;
	sessionCount: number;
	allCount: number;
	sessionLastUsedAt?: string;
	allLastUsedAt?: string;
}

export interface CommandHistoryStore {
	recordSuccess(input: {
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
	}): Promise<void>;
	query(input: CommandHistoryQuery): Promise<CommandHistoryCandidate[]>;
	queryArgumentUsage(input: {
		sessionId: string;
		commandId: string;
		argumentIndex: number;
		priorArguments?: string[];
		prefix?: string;
		limit?: number;
	}): Promise<ArgumentUsageRecord[]>;
}

export function normalizeCommandText(commandText: string): string {
	return commandText.trim().toLocaleLowerCase();
}

