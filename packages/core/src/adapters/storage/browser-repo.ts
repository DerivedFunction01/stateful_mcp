// REFERENCE: docs/browser.md

import type { OwnerScope } from "../../config/types";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../../middleware/dictionary/interfaces";
import type {
	Concept,
	CustomExpression,
	Namespace,
} from "../../middleware/dictionary/types";
import type {
	PersistentFilterStore,
	PersistentFormStore,
	PersistentObjectStore,
	SessionFilterStore,
	SessionFormStore,
	SessionObjectStore,
} from "./interfaces";

// Declare window types to allow compilation in Node environment without dom libs
declare const window: any;

// Helper to determine key namespaces
function getSessionStateKey(sessionId: string, id: string): string {
	return `stateful_mcp:session:${sessionId}:state:${id}`;
}

function getSessionAliasKey(sessionId: string, alias: string): string {
	return `stateful_mcp:session:${sessionId}:alias:${alias}`;
}

function getPersistentStateKey(id: string, scope: OwnerScope): string {
	const userSegment =
		scope.level === "user" ? `user:${scope.userId}` : "global";
	return `stateful_mcp:persistent:${userSegment}:state:${id}`;
}

function getBrowserStorage(): any {
	if (typeof window !== "undefined" && window.localStorage) {
		return window.localStorage;
	}
	return null;
}

/**
 * Browser LocalStorage Session Storage Adapter.
 */
export class LocalStorageSessionStore
	implements SessionFilterStore, SessionObjectStore, SessionFormStore
{
	async get(sessionId: string, id: string): Promise<any | null> {
		const storage = getBrowserStorage();
		if (!storage) return null;
		const data = storage.getItem(getSessionStateKey(sessionId, id));
		return data ? JSON.parse(data) : null;
	}

	async create(sessionId: string, state: any, alias?: string): Promise<string> {
		const storage = getBrowserStorage();
		if (!storage) throw new Error("LocalStorage is not available.");

		const id =
			state.formId !== undefined
				? `form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
				: state.filterId !== undefined
					? `filt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
					: state.objectId !== undefined
						? `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
						: `state_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

		const savedState = {
			...state,
			formId: state.formId !== undefined ? id : undefined,
			filterId: state.filterId !== undefined ? id : undefined,
			objectId: state.objectId !== undefined ? id : undefined,
		};

		storage.setItem(
			getSessionStateKey(sessionId, id),
			JSON.stringify(savedState),
		);

		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}

		return id;
	}

	async set(sessionId: string, id: string, state: any): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.setItem(getSessionStateKey(sessionId, id), JSON.stringify(state));
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.setItem(getSessionAliasKey(sessionId, alias), targetId);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const storage = getBrowserStorage();
		if (!storage) return null;
		return storage.getItem(getSessionAliasKey(sessionId, alias));
	}

	async delete(sessionId: string, id: string): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.removeItem(getSessionStateKey(sessionId, id));
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.removeItem(getSessionAliasKey(sessionId, alias));
	}

	async listSession(sessionId: string): Promise<string[]> {
		const storage = getBrowserStorage();
		if (!storage) return [];
		const prefix = `stateful_mcp:session:${sessionId}:state:`;
		const ids: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				ids.push(key.replace(prefix, ""));
			}
		}
		return ids;
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const storage = getBrowserStorage();
		if (!storage) return [];
		const prefix = `stateful_mcp:session:${sessionId}:state:`;
		const ids: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				const valStr = storage.getItem(key);
				if (valStr) {
					const val = JSON.parse(valStr);
					if (
						val.parentFilterId === parentId ||
						val.parentObjectId === parentId ||
						val.parentFormId === parentId
					) {
						ids.push(key.replace(prefix, ""));
					}
				}
			}
		}
		return ids;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		const prefix = `stateful_mcp:session:${sessionId}:state:`;
		const aliasPrefix = `stateful_mcp:session:${sessionId}:alias:`;
		const now = Date.now();
		const toDelete: string[] = [];

		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				if (olderThanMs !== undefined) {
					const valStr = storage.getItem(key);
					if (valStr) {
						const val = JSON.parse(valStr);
						const ts = val.createdAt || val.timestamp;
						if (ts) {
							const createdTime = new Date(ts).getTime();
							if (now - createdTime > olderThanMs) {
								toDelete.push(key);
							}
						}
					}
				} else {
					toDelete.push(key);
				}
			} else if (
				key &&
				key.startsWith(aliasPrefix) &&
				olderThanMs === undefined
			) {
				toDelete.push(key);
			}
		}

		for (const key of toDelete) {
			storage.removeItem(key);
		}
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const storage = getBrowserStorage();
		if (!storage) return [];
		const prefix = `stateful_mcp:session:${sessionId}:alias:`;
		const list: Array<{ alias: string; targetId: string }> = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				const targetId = storage.getItem(key) || "";
				list.push({ alias: key.replace(prefix, ""), targetId });
			}
		}
		return list;
	}
}

/**
 * Browser LocalStorage Persistent Storage Adapter.
 */
export class LocalStoragePersistentStore
	implements PersistentFilterStore, PersistentObjectStore, PersistentFormStore
{
	async get(id: string, scope: OwnerScope): Promise<any | null> {
		const storage = getBrowserStorage();
		if (!storage) return null;
		const data = storage.getItem(getPersistentStateKey(id, scope));
		return data ? JSON.parse(data) : null;
	}

	async set(id: string, state: any, scope: OwnerScope): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.setItem(getPersistentStateKey(id, scope), JSON.stringify(state));
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.removeItem(getPersistentStateKey(id, scope));
	}

	async findByTag(tag: string, scope: OwnerScope): Promise<any[]> {
		const list = await this.list(scope, false);
		return list.filter((item) => item.tags && item.tags.includes(tag));
	}

	async list(scope: OwnerScope, includeGlobal?: boolean): Promise<any[]> {
		const storage = getBrowserStorage();
		if (!storage) return [];

		const userSegment =
			scope.level === "user" ? `user:${scope.userId}` : "global";
		const userPrefix = `stateful_mcp:persistent:${userSegment}:state:`;
		const globalPrefix = `stateful_mcp:persistent:global:state:`;

		const results: any[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key) {
				if (key.startsWith(userPrefix)) {
					const val = storage.getItem(key);
					if (val) results.push({ ...JSON.parse(val), scope });
				} else if (includeGlobal && key.startsWith(globalPrefix)) {
					const val = storage.getItem(key);
					if (val)
						results.push({ ...JSON.parse(val), scope: { level: "global" } });
				}
			}
		}
		return results;
	}
}

/**
 * Browser IndexedDB Session Storage Adapter.
 */
export class IndexedDbSessionStore
	implements SessionFilterStore, SessionObjectStore, SessionFormStore
{
	constructor(private dbName: string = "stateful_mcp") {}

	private async getDB(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (typeof window === "undefined" || !window.indexedDB) {
				reject(new Error("IndexedDB is not available in this environment."));
				return;
			}
			const request = window.indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("states")) {
					db.createObjectStore("states");
				}
				if (!db.objectStoreNames.contains("aliases")) {
					db.createObjectStore("aliases");
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	private async readKey(storeName: string, key: string): Promise<any> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, "readonly");
			const store = tx.objectStore(storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	private async writeKey(
		storeName: string,
		key: string,
		value: any,
	): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(storeName, "readwrite");
			const store = tx.objectStore(storeName);
			const request = store.put(value, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private async deleteKey(storeName: string, key: string): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(storeName, "readwrite");
			const store = tx.objectStore(storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private async listAllEntries(
		storeName: string,
	): Promise<{ key: string; value: any }[]> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, "readonly");
			const store = tx.objectStore(storeName);
			const reqKeys = store.getAllKeys();
			const reqVals = store.getAll();
			reqKeys.onsuccess = () => {
				reqVals.onsuccess = () => {
					const results = reqKeys.result.map((k: any, i: number) => ({
						key: String(k),
						value: reqVals.result[i],
					}));
					resolve(results);
				};
			};
			reqKeys.onerror = () => reject(reqKeys.error);
			reqVals.onerror = () => reject(reqVals.error);
		});
	}

	async get(sessionId: string, id: string): Promise<any | null> {
		return this.readKey("states", getSessionStateKey(sessionId, id));
	}

	async create(sessionId: string, state: any, alias?: string): Promise<string> {
		const id =
			state.formId !== undefined
				? `form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
				: state.filterId !== undefined
					? `filt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
					: state.objectId !== undefined
						? `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
						: `state_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

		const savedState = {
			...state,
			formId: state.formId !== undefined ? id : undefined,
			filterId: state.filterId !== undefined ? id : undefined,
			objectId: state.objectId !== undefined ? id : undefined,
		};

		await this.writeKey(
			"states",
			getSessionStateKey(sessionId, id),
			savedState,
		);

		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}

		return id;
	}

	async set(sessionId: string, id: string, state: any): Promise<void> {
		await this.writeKey("states", getSessionStateKey(sessionId, id), state);
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.writeKey(
			"aliases",
			getSessionAliasKey(sessionId, alias),
			targetId,
		);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		return this.readKey("aliases", getSessionAliasKey(sessionId, alias));
	}

	async delete(sessionId: string, id: string): Promise<void> {
		await this.deleteKey("states", getSessionStateKey(sessionId, id));
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.deleteKey("aliases", getSessionAliasKey(sessionId, alias));
	}

	async listSession(sessionId: string): Promise<string[]> {
		const prefix = `stateful_mcp:session:${sessionId}:state:`;
		const entries = await this.listAllEntries("states");
		return entries
			.filter((e) => e.key.startsWith(prefix))
			.map((e) => e.key.replace(prefix, ""));
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const prefix = `stateful_mcp:session:${sessionId}:state:`;
		const entries = await this.listAllEntries("states");
		const results: string[] = [];
		for (const e of entries) {
			if (e.key.startsWith(prefix)) {
				const val = e.value;
				if (
					val.parentFilterId === parentId ||
					val.parentObjectId === parentId ||
					val.parentFormId === parentId
				) {
					results.push(e.key.replace(prefix, ""));
				}
			}
		}
		return results;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const prefix = `stateful_mcp:session:${sessionId}:state:`;
		const aliasPrefix = `stateful_mcp:session:${sessionId}:alias:`;
		const entries = await this.listAllEntries("states");
		const aliasEntries = await this.listAllEntries("aliases");
		const now = Date.now();

		for (const e of entries) {
			if (e.key.startsWith(prefix)) {
				if (olderThanMs !== undefined) {
					const val = e.value;
					const ts = val.createdAt || val.timestamp;
					if (ts) {
						const createdTime = new Date(ts).getTime();
						if (now - createdTime > olderThanMs) {
							await this.deleteKey("states", e.key);
						}
					}
				} else {
					await this.deleteKey("states", e.key);
				}
			}
		}

		if (olderThanMs === undefined) {
			for (const e of aliasEntries) {
				if (e.key.startsWith(aliasPrefix)) {
					await this.deleteKey("aliases", e.key);
				}
			}
		}
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = `stateful_mcp:session:${sessionId}:alias:`;
		const entries = await this.listAllEntries("aliases");
		return entries
			.filter((e) => e.key.startsWith(prefix))
			.map((e) => ({
				alias: e.key.replace(prefix, ""),
				targetId: String(e.value),
			}));
	}
}

/**
 * Browser IndexedDB Persistent Storage Adapter.
 */
export class IndexedDbPersistentStore
	implements PersistentFilterStore, PersistentObjectStore, PersistentFormStore
{
	constructor(private dbName: string = "stateful_mcp") {}

	private async getDB(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (typeof window === "undefined" || !window.indexedDB) {
				reject(new Error("IndexedDB is not available in this environment."));
				return;
			}
			const request = window.indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("states")) {
					db.createObjectStore("states");
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	private async readKey(storeName: string, key: string): Promise<any> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, "readonly");
			const store = tx.objectStore(storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	private async writeKey(
		storeName: string,
		key: string,
		value: any,
	): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(storeName, "readwrite");
			const store = tx.objectStore(storeName);
			const request = store.put(value, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private async deleteKey(storeName: string, key: string): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(storeName, "readwrite");
			const store = tx.objectStore(storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private async listAllEntries(
		storeName: string,
	): Promise<{ key: string; value: any }[]> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, "readonly");
			const store = tx.objectStore(storeName);
			const reqKeys = store.getAllKeys();
			const reqVals = store.getAll();
			reqKeys.onsuccess = () => {
				reqVals.onsuccess = () => {
					const results = reqKeys.result.map((k: any, i: number) => ({
						key: String(k),
						value: reqVals.result[i],
					}));
					resolve(results);
				};
			};
			reqKeys.onerror = () => reject(reqKeys.error);
			reqVals.onerror = () => reject(reqVals.error);
		});
	}

	async get(id: string, scope: OwnerScope): Promise<any | null> {
		return this.readKey("states", getPersistentStateKey(id, scope));
	}

	async set(id: string, state: any, scope: OwnerScope): Promise<void> {
		await this.writeKey("states", getPersistentStateKey(id, scope), state);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.deleteKey("states", getPersistentStateKey(id, scope));
	}

	async findByTag(tag: string, scope: OwnerScope): Promise<any[]> {
		const list = await this.list(scope, false);
		return list.filter((item) => item.tags && item.tags.includes(tag));
	}

	async list(scope: OwnerScope, includeGlobal?: boolean): Promise<any[]> {
		const userSegment =
			scope.level === "user" ? `user:${scope.userId}` : "global";
		const userPrefix = `stateful_mcp:persistent:${userSegment}:state:`;
		const globalPrefix = `stateful_mcp:persistent:global:state:`;

		const entries = await this.listAllEntries("states");
		const results: any[] = [];
		for (const e of entries) {
			if (e.key.startsWith(userPrefix)) {
				results.push({ ...e.value, scope });
			} else if (includeGlobal && e.key.startsWith(globalPrefix)) {
				results.push({ ...e.value, scope: { level: "global" } });
			}
		}
		return results;
	}
}

export class LocalStorageConceptStore implements ConceptStore {
	constructor(private prefix: string = "dict_concepts:") {}

	private getNamespacesKey(): string {
		return `${this.prefix}namespaces`;
	}
	private getConceptKey(id: string): string {
		return `${this.prefix}concept:${id}`;
	}

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		const results: Concept[] = [];
		const lowerQuery = query.toLowerCase();
		const keys: string[] = [];
		const len = window.localStorage.length;
		for (let i = 0; i < len; i++) {
			const k = window.localStorage.key(i);
			if (k) keys.push(k);
		}
		for (const key of keys) {
			if (key.startsWith(`${this.prefix}concept:`)) {
				const raw = window.localStorage.getItem(key);
				if (raw) {
					const c: Concept = JSON.parse(raw);
					if (namespaceCode && c.namespaceCode !== namespaceCode) continue;
					if (
						c.id.toLowerCase().includes(lowerQuery) ||
						c.standardCode.toLowerCase().includes(lowerQuery) ||
						c.display.toLowerCase().includes(lowerQuery) ||
						(c.description && c.description.toLowerCase().includes(lowerQuery))
					) {
						results.push(c);
					}
					if (results.length >= limit) break;
				}
			}
		}
		return results;
	}

	async getById(id: string): Promise<Concept | null> {
		const raw = window.localStorage.getItem(this.getConceptKey(id));
		return raw ? JSON.parse(raw) : null;
	}

	async listNamespaces(): Promise<Namespace[]> {
		const raw = window.localStorage.getItem(this.getNamespacesKey());
		return raw ? JSON.parse(raw) : [];
	}

	async addConcept(concept: Concept): Promise<void> {
		window.localStorage.setItem(
			this.getConceptKey(concept.id),
			JSON.stringify(concept),
		);
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		const list = await this.listNamespaces();
		if (!list.some((n) => n.code === namespace.code)) {
			list.push(namespace);
			window.localStorage.setItem(
				this.getNamespacesKey(),
				JSON.stringify(list),
			);
		}
	}
}

export class LocalStoragePersistentExpressionStore
	implements PersistentExpressionStore
{
	constructor(private prefix: string = "dict_expressions:") {}

	private getKey(id: string): string {
		return `${this.prefix}${id}`;
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		const context = {
			...expression.context,
			scope_level: scope.level,
			scope_id: scope.level === "user" ? scope.userId : null,
		};
		const saved = { ...expression, context };
		window.localStorage.setItem(
			this.getKey(expression.id),
			JSON.stringify(saved),
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const key = this.getKey(id);
		const raw = window.localStorage.getItem(key);
		if (raw) {
			const e = JSON.parse(raw);
			const scopeId = scope.level === "user" ? scope.userId : null;
			const el = e.context?.scope_level;
			const ei = e.context?.scope_id;
			if (el === scope.level && (ei === scopeId || !ei)) {
				window.localStorage.removeItem(key);
			}
		}
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const results: CustomExpression[] = [];
		const scopeId = scope.level === "user" ? scope.userId : null;
		const keys: string[] = [];
		const len = window.localStorage.length;
		for (let i = 0; i < len; i++) {
			const k = window.localStorage.key(i);
			if (k) keys.push(k);
		}
		for (const key of keys) {
			if (key.startsWith(this.prefix)) {
				const raw = window.localStorage.getItem(key);
				if (raw) {
					const e = JSON.parse(raw);
					const el =
						e.context?.scope_level || (e.context?.user_id ? "user" : "global");
					const ei = e.context?.scope_id || e.context?.user_id;
					if (el === scope.level && (ei === scopeId || !ei)) {
						results.push(e);
					} else if (includeGlobal && el === "global") {
						results.push(e);
					}
				}
			}
		}
		return results;
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const raw = window.localStorage.getItem(this.getKey(id));
		return raw ? JSON.parse(raw) : null;
	}
}

export class IndexedDbConceptStore implements ConceptStore {
	constructor(private dbName: string = "stateful_mcp_dict") {}

	private async getDB(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (typeof window === "undefined" || !window.indexedDB) {
				reject(new Error("IndexedDB is not available."));
				return;
			}
			const request = window.indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("concepts")) {
					db.createObjectStore("concepts");
				}
				if (!db.objectStoreNames.contains("namespaces")) {
					db.createObjectStore("namespaces");
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("concepts", "readonly");
			const store = tx.objectStore("concepts");
			const request = store.openCursor();
			const results: Concept[] = [];
			const lowerQuery = query.toLowerCase();

			request.onsuccess = (event: any) => {
				const cursor = event.target.result;
				if (cursor) {
					const c: Concept = cursor.value;
					let match = true;
					if (namespaceCode && c.namespaceCode !== namespaceCode) match = false;
					if (match) {
						if (
							c.id.toLowerCase().includes(lowerQuery) ||
							c.standardCode.toLowerCase().includes(lowerQuery) ||
							c.display.toLowerCase().includes(lowerQuery) ||
							(c.description &&
								c.description.toLowerCase().includes(lowerQuery))
						) {
							results.push(c);
						}
					}
					if (results.length < limit) {
						cursor.continue();
					} else {
						resolve(results);
					}
				} else {
					resolve(results);
				}
			};
			request.onerror = () => reject(request.error);
		});
	}

	async getById(id: string): Promise<Concept | null> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("concepts", "readonly");
			const store = tx.objectStore("concepts");
			const request = store.get(id);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	async listNamespaces(): Promise<Namespace[]> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("namespaces", "readonly");
			const store = tx.objectStore("namespaces");
			const request = store.openCursor();
			const results: Namespace[] = [];
			request.onsuccess = (event: any) => {
				const cursor = event.target.result;
				if (cursor) {
					results.push(cursor.value);
					cursor.continue();
				} else {
					resolve(results);
				}
			};
			request.onerror = () => reject(request.error);
		});
	}

	async addConcept(concept: Concept): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction("concepts", "readwrite");
			const store = tx.objectStore("concepts");
			const request = store.put(concept, concept.id);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction("namespaces", "readwrite");
			const store = tx.objectStore("namespaces");
			const request = store.put(namespace, namespace.code);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}
}

export class IndexedDbPersistentExpressionStore
	implements PersistentExpressionStore
{
	constructor(private dbName: string = "stateful_mcp_dict") {}

	private async getDB(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (typeof window === "undefined" || !window.indexedDB) {
				reject(new Error("IndexedDB is not available."));
				return;
			}
			const request = window.indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("expressions")) {
					db.createObjectStore("expressions");
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		const db = await this.getDB();
		const context = {
			...expression.context,
			scope_level: scope.level,
			scope_id: scope.level === "user" ? scope.userId : null,
		};
		const saved = { ...expression, context };
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction("expressions", "readwrite");
			const store = tx.objectStore("expressions");
			const request = store.put(saved, expression.id);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const db = await this.getDB();
		const scopeId = scope.level === "user" ? scope.userId : null;
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction("expressions", "readwrite");
			const store = tx.objectStore("expressions");
			const getReq = store.get(id);
			getReq.onsuccess = () => {
				const e = getReq.result;
				if (e) {
					const el = e.context?.scope_level;
					const ei = e.context?.scope_id;
					if (el === scope.level && (ei === scopeId || !ei)) {
						const delReq = store.delete(id);
						delReq.onsuccess = () => resolve();
						delReq.onerror = () => reject(delReq.error);
					} else {
						resolve();
					}
				} else {
					resolve();
				}
			};
			getReq.onerror = () => reject(getReq.error);
		});
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const db = await this.getDB();
		const scopeId = scope.level === "user" ? scope.userId : null;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("expressions", "readonly");
			const store = tx.objectStore("expressions");
			const request = store.openCursor();
			const results: CustomExpression[] = [];
			request.onsuccess = (event: any) => {
				const cursor = event.target.result;
				if (cursor) {
					const e = cursor.value;
					const el =
						e.context?.scope_level || (e.context?.user_id ? "user" : "global");
					const ei = e.context?.scope_id || e.context?.user_id;
					if (el === scope.level && (ei === scopeId || !ei)) {
						results.push(e);
					} else if (includeGlobal && el === "global") {
						results.push(e);
					}
					cursor.continue();
				} else {
					resolve(results);
				}
			};
			request.onerror = () => reject(request.error);
		});
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("expressions", "readonly");
			const store = tx.objectStore("expressions");
			const request = store.get(id);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}
}
