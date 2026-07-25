declare const window: any;
type Storage = any;
import type { OwnerScope } from "@stateful-mcp/core/config/types";
import type { KvBackend } from "../kv-backend";

export class LocalStorageKvBackend implements KvBackend {
	private prefix: string;

	constructor(prefix: string = "stateful_mcp") {
		this.prefix = prefix;
	}

	private getStorage(): Storage | null {
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage;
		}
		return null;
	}

	// --- Key Generators ---

	private getSessionPrefix(sessionId: string): string {
		return `${this.prefix}:session:${sessionId}:state:`;
	}

	private getSessionKey(sessionId: string, id: string): string {
		return `${this.getSessionPrefix(sessionId)}${id}`;
	}

	private getAliasPrefix(sessionId: string): string {
		return `${this.prefix}:session:${sessionId}:alias:`;
	}

	private getAliasKey(sessionId: string, alias: string): string {
		return `${this.getAliasPrefix(sessionId)}${alias}`;
	}

	private getScopeString(scope: OwnerScope): string {
		return scope.level === "user" ? `user:${scope.userId}` : "global";
	}

	private getPersistentPrefix(scopeString: string): string {
		return `${this.prefix}:persistent:${scopeString}:state:`;
	}

	private getPersistentKey(id: string, scope: OwnerScope): string {
		return `${this.getPersistentPrefix(this.getScopeString(scope))}${id}`;
	}

	// --- Lifecycle ---

	async load(): Promise<void> {
		// LocalStorage is ready synchronously, no initialization required.
	}

	async save(): Promise<void> {
		// LocalStorage persists on write, no-op.
	}

	// --- Session State ---

	async getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null> {
		const storage = this.getStorage();
		if (!storage) return null;

		const data = storage.getItem(this.getSessionKey(sessionId, id));
		return data ? JSON.parse(data) : null;
	}

	async setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		const storage = this.getStorage();
		if (!storage) return;

		storage.setItem(this.getSessionKey(sessionId, id), JSON.stringify(value));
	}

	async deleteSessionState(sessionId: string, id: string): Promise<void> {
		const storage = this.getStorage();
		if (!storage) return;

		storage.removeItem(this.getSessionKey(sessionId, id));
	}

	async listSessionIds(sessionId: string): Promise<string[]> {
		const storage = this.getStorage();
		if (!storage) return [];

		const prefix = this.getSessionPrefix(sessionId);
		const ids: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				ids.push(key.slice(prefix.length));
			}
		}
		return ids;
	}

	async *scanSessionStates(
		sessionId: string,
	): AsyncIterable<Record<string, any>> {
		const storage = this.getStorage();
		if (!storage) return;

		const prefix = this.getSessionPrefix(sessionId);
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				const val = storage.getItem(key);
				if (val) {
					yield JSON.parse(val);
				}
			}
		}
	}

	// --- Persistent State ---

	async getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null> {
		const storage = this.getStorage();
		if (!storage) return null;

		const data = storage.getItem(this.getPersistentKey(id, scope));
		return data ? JSON.parse(data) : null;
	}

	async setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		const storage = this.getStorage();
		if (!storage) return;

		storage.setItem(this.getPersistentKey(id, scope), JSON.stringify(value));
	}

	async deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		const storage = this.getStorage();
		if (!storage) return;

		storage.removeItem(this.getPersistentKey(id, scope));
	}

	async *scanPersistentStates(
		scope: OwnerScope,
		includeGlobal: boolean = true,
	): AsyncIterable<Record<string, any>> {
		const storage = this.getStorage();
		if (!storage) return;

		const userPrefix = this.getPersistentPrefix(this.getScopeString(scope));
		const globalPrefix = this.getPersistentPrefix("global");

		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (!key) continue;

			if (key.startsWith(userPrefix)) {
				const val = storage.getItem(key);
				if (val) yield JSON.parse(val);
			} else if (includeGlobal && key.startsWith(globalPrefix)) {
				const val = storage.getItem(key);
				if (val) yield JSON.parse(val);
			}
		}
	}

	// --- Aliases ---

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const storage = this.getStorage();
		if (!storage) return null;

		return storage.getItem(this.getAliasKey(sessionId, alias));
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		const storage = this.getStorage();
		if (!storage) return;

		storage.setItem(this.getAliasKey(sessionId, alias), targetId);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		const storage = this.getStorage();
		if (!storage) return;

		storage.removeItem(this.getAliasKey(sessionId, alias));
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const storage = this.getStorage();
		if (!storage) return [];

		const prefix = this.getAliasPrefix(sessionId);
		const list: Array<{ alias: string; targetId: string }> = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				const targetId = storage.getItem(key) || "";
				list.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return list;
	}
}
