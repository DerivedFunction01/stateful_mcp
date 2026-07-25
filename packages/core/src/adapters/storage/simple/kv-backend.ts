import type { OwnerScope } from "@stateful-mcp/core/config/types";

export interface KvBackend {
	load(): Promise<void>;
	save(): Promise<void>;

	getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null>;
	setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void>;
	deleteSessionState(sessionId: string, id: string): Promise<void>;
	listSessionIds(sessionId: string): Promise<string[]>;
	scanSessionStates(sessionId: string): AsyncIterable<Record<string, any>>;

	getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null>;
	setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void>;
	deletePersistentState(id: string, scope: OwnerScope): Promise<void>;
	scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>>;

	getAlias(sessionId: string, alias: string): Promise<string | null>;
	setAlias(sessionId: string, alias: string, targetId: string): Promise<void>;
	deleteAlias(sessionId: string, alias: string): Promise<void>;
	listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>>;
}
export const sessionKey = (sessionId: string, id: string) =>
	`${sessionId}:${id}`;
export const sessionPrefix = (sessionId: string) => `${sessionId}:`;
export const aliasKey = (sessionId: string, alias: string) =>
	`${sessionId}:${alias}`;
export const aliasPrefix = (sessionId: string) => `${sessionId}:`;
export const persistentKey = (id: string, scope: OwnerScope) => {
	const scopeId = scope.level === "user" ? scope.userId : "global";
	return `${scope.level}:${scopeId}:${id}`;
};
export const persistentPrefix = (
	scope: OwnerScope,
	includeGlobal?: boolean,
) => {
	if (scope.level === "global") return "global:global:";
	return `user:${scope.userId}:`;
};
