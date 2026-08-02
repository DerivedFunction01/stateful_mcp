type IDBOpenDBRequest = any;
type IDBDatabase = any;
type IDBTransaction = any;
type IDBObjectStore = any;
type IDBRequest<T = any> = any;
type IDBFactory = any;

import type { OwnerScope } from "@stateful-mcp/core/config/types";
import type { KvBackend } from "../kv-backend";

interface SessionStateRecord {
	id: string;
	sessionId: string;
	value: Record<string, any>;
}

interface PersistentStateRecord {
	id: string;
	scope: OwnerScope;
	value: Record<string, any>;
}

interface AliasRecord {
	key: string;
	targetId: string;
}

function getIndexedDB(): IDBFactory | null {
	const runtime = globalThis as any;
	return runtime.indexedDB ?? runtime.window?.indexedDB ?? null;
}

async function openDb(
	dbName: string,
	upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
	const idb = getIndexedDB();
	if (!idb) throw new Error("IndexedDB is not available.");

	return new Promise((resolve, reject) => {
		const request = idb.open(dbName, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			upgrade(db);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function idbTransaction(
	db: IDBDatabase,
	storeNames: string | string[],
	mode: "readonly" | "readwrite" = "readonly",
): IDBTransaction {
	const tx = db.transaction(storeNames, mode);
	return tx;
}

export class IndexedDbKvBackend implements KvBackend {
	private dbName: string;
	private db: IDBDatabase | null = null;

	constructor(dbName: string = "stateful_mcp_kv") {
		this.dbName = dbName;
	}

	private async getDB(): Promise<IDBDatabase> {
		if (this.db) return this.db;
		this.db = await openDb(this.dbName, (db) => {
			if (!db.objectStoreNames.contains("sessionStates")) {
				const store = db.createObjectStore("sessionStates", { keyPath: "id" });
				store.createIndex("by_sessionId", "sessionId", { unique: false });
			}
			if (!db.objectStoreNames.contains("persistentStates")) {
				const store = db.createObjectStore("persistentStates", {
					keyPath: "id",
				});
			}
			if (!db.objectStoreNames.contains("aliases")) {
				const store = db.createObjectStore("aliases", { keyPath: "key" });
			}
			if (!db.objectStoreNames.contains("dictFilters")) {
				const store = db.createObjectStore("dictFilters", {
					keyPath: "filterId",
				});
				store?.createIndex?.("by_concept_role", ["conceptId", "roleName"], {
					unique: false,
				});
			}
			if (!db.objectStoreNames.contains("dictSyncState")) {
				db.createObjectStore("dictSyncState", {
					keyPath: ["projectionId", "sourceId", "domain"],
				});
			}
			if (!db.objectStoreNames.contains("dictTombstones")) {
				const store = db.createObjectStore("dictTombstones", {
					keyPath: ["sourceId", "domain", "recordId"],
				});
				store?.createIndex?.("by_domain", ["sourceId", "domain"], {
					unique: false,
				});
			}
		});
		return this.db;
	}

	async load(): Promise<void> {
		await this.getDB();
	}

	async save(): Promise<void> {
		// IndexedDB is already persisted on each write — no-op.
	}

	async getSessionState(
		sessionId: string,
		id: string,
	): Promise<Record<string, any> | null> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "sessionStates", "readonly");
		const store = tx.objectStore("sessionStates");
		const result = await idbRequest<SessionStateRecord>(store.get(id));

		if (result && result.sessionId === sessionId) {
			return result.value;
		}
		return null;
	}

	async setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "sessionStates", "readwrite");
		const store = tx.objectStore("sessionStates");
		store.put({ id, sessionId, value });

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async deleteSessionState(sessionId: string, id: string): Promise<void> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "sessionStates", "readwrite");
		const store = tx.objectStore("sessionStates");
		store.delete(id);

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async listSessionIds(sessionId: string): Promise<string[]> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "sessionStates", "readonly");
		const store = tx.objectStore("sessionStates");
		const index = store.index("by_sessionId");
		const results = await idbRequest<SessionStateRecord[]>(
			index.getAll(sessionId),
		);
		return results.map((r) => r.id);
	}

	async *scanSessionStates(
		sessionId: string,
	): AsyncIterable<Record<string, any>> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "sessionStates", "readonly");
		const store = tx.objectStore("sessionStates");
		const index = store.index("by_sessionId");
		const results = await idbRequest<SessionStateRecord[]>(
			index.getAll(sessionId),
		);
		for (const r of results) {
			yield r.value;
		}
	}

	async getPersistentState(
		id: string,
		scope: OwnerScope,
	): Promise<Record<string, any> | null> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "persistentStates", "readonly");
		const store = tx.objectStore("persistentStates");
		const result = await idbRequest<PersistentStateRecord>(store.get(id));

		if (result && result.scope) {
			return result.value;
		}
		return null;
	}

	async setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "persistentStates", "readwrite");
		const store = tx.objectStore("persistentStates");
		store.put({ id, scope, value });

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "persistentStates", "readwrite");
		const store = tx.objectStore("persistentStates");
		store.delete(id);

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async *scanPersistentStates(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): AsyncIterable<Record<string, any>> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "persistentStates", "readonly");
		const store = tx.objectStore("persistentStates");
		const results = await idbRequest<PersistentStateRecord[]>(store.getAll());

		for (const r of results) {
			if (r.scope?.level === "global") {
				if (includeGlobal !== false) yield r.value;
			} else if (scope.level === "user" && scope.userId === r.scope?.userId) {
				yield r.value;
			}
		}
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "aliases", "readonly");
		const store = tx.objectStore("aliases");
		const result = await idbRequest<AliasRecord>(
			store.get(`${sessionId}:${alias}`),
		);
		return result?.targetId ?? null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "aliases", "readwrite");
		const store = tx.objectStore("aliases");
		store.put({ key: `${sessionId}:${alias}`, targetId });

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "aliases", "readwrite");
		const store = tx.objectStore("aliases");
		store.delete(`${sessionId}:${alias}`);

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const db = await this.getDB();
		const tx = idbTransaction(db, "aliases", "readonly");
		const store = tx.objectStore("aliases");
		const results = await idbRequest<AliasRecord[]>(store.getAll());

		const prefix = `${sessionId}:`;
		const out: Array<{ alias: string; targetId: string }> = [];
		for (const r of results) {
			if (r.key.startsWith(prefix)) {
				out.push({ alias: r.key.slice(prefix.length), targetId: r.targetId });
			}
		}
		return out;
	}
}
