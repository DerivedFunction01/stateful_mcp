import type { OwnerScope } from "../../../../config/types";
import {
	aliasKey,
	aliasPrefix,
	type KvBackend,
	persistentKey,
	sessionKey,
	sessionPrefix,
} from "../kv-backend";

export class MemoryKvBackend implements KvBackend {
	private sessionStates = new Map<string, Record<string, any>>();
	private persistentStates = new Map<string, Record<string, any>>();
	private aliases = new Map<string, string>();

	load(): Promise<void> {
		return Promise.resolve();
	}

	save(): Promise<void> {
		return Promise.resolve();
	}

	getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null> {
		return Promise.resolve(
			this.sessionStates.get(sessionKey(sessionId, id)) ?? null,
		);
	}

	setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		this.sessionStates.set(sessionKey(sessionId, id), value);
		return Promise.resolve();
	}

	deleteSessionState(sessionId: string, id: string): Promise<void> {
		this.sessionStates.delete(sessionKey(sessionId, id));
		return Promise.resolve();
	}

	async listSessionIds(sessionId: string): Promise<string[]> {
		const prefix = sessionPrefix(sessionId);
		const ids: string[] = [];
		for (const key of this.sessionStates.keys()) {
			if (key.startsWith(prefix)) ids.push(key.slice(prefix.length));
		}
		return ids;
	}

	async *scanSessionStates(
		sessionId: string,
	): AsyncIterable<Record<string, any>> {
		const prefix = sessionPrefix(sessionId);
		for (const [key, val] of this.sessionStates.entries()) {
			if (key.startsWith(prefix)) yield val;
		}
	}

	getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null> {
		if (scope.level === "user") {
			const userKey = persistentKey(id, scope);
			const userVal = this.persistentStates.get(userKey);
			if (userVal) return Promise.resolve(userVal);
		}
		const globalKey = persistentKey(id, { level: "global" });
		return Promise.resolve(this.persistentStates.get(globalKey) ?? null);
	}

	setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		this.persistentStates.set(persistentKey(id, scope), value);
		return Promise.resolve();
	}

	deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		this.persistentStates.delete(persistentKey(id, scope));
		return Promise.resolve();
	}

	async *scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>> {
		const isUser = scope.level === "user";
		const userPrefix = isUser ? `user:${scope.userId}:` : null;
		const globalPrefix = "global:global:";
		const includeGlobals = includeGlobal !== false;

		for (const [key, val] of this.persistentStates.entries()) {
			if (isUser && userPrefix && key.startsWith(userPrefix)) {
				yield val;
			}
			if (includeGlobals && key.startsWith(globalPrefix)) {
				yield val;
			}
		}
	}

	getAlias(sessionId: string, alias: string): Promise<string | null> {
		return Promise.resolve(
			this.aliases.get(aliasKey(sessionId, alias)) ?? null,
		);
	}

	setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		this.aliases.set(aliasKey(sessionId, alias), targetId);
		return Promise.resolve();
	}

	deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(aliasKey(sessionId, alias));
		return Promise.resolve();
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = aliasPrefix(sessionId);
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}
}
