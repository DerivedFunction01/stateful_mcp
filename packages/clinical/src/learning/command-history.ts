export type CommandHistoryScope = "session" | "all";

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

export interface CommandHistoryStore {
	recordSuccess(input: {
		sessionId: string;
		commandText: string;
		canonicalVerb?: string;
		commandId?: string;
		executedAt?: string;
	}): Promise<void>;
	query(input: CommandHistoryQuery): Promise<CommandHistoryCandidate[]>;
}

export function normalizeCommandText(commandText: string): string {
	return commandText.trim().toLocaleLowerCase();
}
