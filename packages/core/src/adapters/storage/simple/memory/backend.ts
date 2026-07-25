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
	private dirtySessionStates = new Set<string>();
	private deletedSessionStates = new Set<string>();
	private dirtyPersistentStates = new Set<string>();
	private deletedPersistentStates = new Set<string>();
	private dirtyAliases = new Set<string>();
	private deletedAliases = new Set<string>();

	load(): Promise<void> {
		return Promise.resolve();
	}

	save(): Promise<void> {
		this.dirtySessionStates.clear();
		this.deletedSessionStates.clear();
		this.dirtyPersistentStates.clear();
		this.deletedPersistentStates.clear();
		this.dirtyAliases.clear();
		this.deletedAliases.clear();
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
		this.dirtySessionStates.add(sessionKey(sessionId, id));
		return Promise.resolve();
	}

	deleteSessionState(sessionId: string, id: string): Promise<void> {
		this.sessionStates.delete(sessionKey(sessionId, id));
		this.deletedSessionStates.add(sessionKey(sessionId, id));
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
		const key = persistentKey(id, scope);
		this.persistentStates.set(key, value);
		this.dirtyPersistentStates.add(key);
		return Promise.resolve();
	}

	deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		const key = persistentKey(id, scope);
		this.persistentStates.delete(key);
		this.deletedPersistentStates.add(key);
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
		this.dirtyAliases.add(aliasKey(sessionId, alias));
		return Promise.resolve();
	}

	deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(aliasKey(sessionId, alias));
		this.deletedAliases.add(aliasKey(sessionId, alias));
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
