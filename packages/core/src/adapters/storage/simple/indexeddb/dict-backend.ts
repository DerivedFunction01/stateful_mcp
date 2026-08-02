type IDBOpenDBRequest = any;
type IDBDatabase = any;
type IDBTransaction = any;
type IDBObjectStore = any;
type IDBRequest<T = any> = any;
type IDBCursor = any;
type IDBFactory = any;
type IDBIndex = any;

import type {
	ConceptRelation,
	CustomExpression,
} from "../../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	DictDelta,
	ExpressionStoreBackend,
} from "../dict-backend";

export interface IndexedDbProjectionChange {
	store: "concepts" | "namespaces" | "relations" | "filters";
	operation: "upsert" | "delete";
	key: string;
	value?: unknown;
}

export interface IndexedDbSyncCheckpoint {
	projectionId: string;
	sourceId: string;
	domain: string;
	cursor?: string;
	status: string;
	updatedAt: string;
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

export class IndexedDbConceptStoreBackend implements ConceptStoreBackend {
	constructor(private dbName: string = "stateful_mcp_dict") {}

	private async getDB(): Promise<IDBDatabase> {
		return openDb(this.dbName, (db) => {
			if (!db.objectStoreNames.contains("concepts")) {
				const store = db.createObjectStore("concepts");
				store?.createIndex?.("by_standardCode", "standardCode", {
					unique: false,
				});
				store?.createIndex?.("by_display", "display", { unique: false });
			}
			if (!db.objectStoreNames.contains("namespaces")) {
				db.createObjectStore("namespaces");
			}
			if (!db.objectStoreNames.contains("relations")) {
				const relStore = db.createObjectStore("relations", {
					keyPath: "id",
				});
				relStore.createIndex("by_conceptId", "conceptId", {
					unique: false,
				});
				relStore.createIndex("by_linkedId", "linkedId", {
					unique: false,
				});
			}
			if (!db.objectStoreNames.contains("filters")) {
				const store = db.createObjectStore("filters", { keyPath: "filterId" });
				store?.createIndex?.("by_concept_role", ["conceptId", "roleName"], {
					unique: false,
				});
				store?.createIndex?.("by_role", "roleName", { unique: false });
			}
			if (!db.objectStoreNames.contains("syncState")) {
				db.createObjectStore("syncState", {
					keyPath: ["projectionId", "sourceId", "domain"],
				});
			}
			if (!db.objectStoreNames.contains("tombstones")) {
				db.createObjectStore("tombstones", {
					keyPath: ["sourceId", "domain", "recordId"],
				});
			}
		});
	}

	async load(
		concepts: Map<string, any>,
		namespaces: Map<string, any>,
		relations: ConceptRelation[],
	): Promise<void> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(
				["concepts", "namespaces", "relations"],
				"readonly",
			);
			const conceptStore = tx.objectStore("concepts");
			const nsStore = tx.objectStore("namespaces");
			const relStore = tx.objectStore("relations");

			let pending = 3;
			const checkDone = () => {
				if (pending === 0) resolve();
			};

			const conceptReq = conceptStore.getAll();
			conceptReq.onsuccess = () => {
				for (const c of conceptReq.result) concepts.set(c.id, c);
				pending--;
				checkDone();
			};
			conceptReq.onerror = () => reject(conceptReq.error);

			const nsReq = nsStore.getAll();
			nsReq.onsuccess = () => {
				for (const ns of nsReq.result) namespaces.set(ns.code, ns);
				pending--;
				checkDone();
			};
			nsReq.onerror = () => reject(nsReq.error);

			const relReq = relStore.getAll();
			relReq.onsuccess = () => {
				relations.push(...relReq.result);
				pending--;
				checkDone();
			};
			relReq.onerror = () => reject(relReq.error);
		});
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(
				["concepts", "namespaces", "relations"],
				"readwrite",
			);
			const conceptStore = tx.objectStore("concepts");
			const nsStore = tx.objectStore("namespaces");
			const relStore = tx.objectStore("relations");

			for (const delta of deltas) {
				if (delta.kind === "concept") {
					if (delta.op === "set" && delta.data) {
						conceptStore.put(delta.data, delta.id);
					} else {
						conceptStore.delete(delta.id);
					}
				} else if (delta.kind === "namespace") {
					if (delta.op === "set" && delta.data) {
						nsStore.put(delta.data, delta.id);
					} else {
						nsStore.delete(delta.id);
					}
				} else if (delta.kind === "relation") {
					if (delta.op === "set" && delta.data) {
						relStore.put(delta.data);
					} else {
						relStore.delete(delta.id);
					}
				}
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	/** Applies projection changes and advances the checkpoint in one transaction. */
	async applyProjectionBatch(
		changes: IndexedDbProjectionChange[],
		checkpoint?: IndexedDbSyncCheckpoint,
	): Promise<void> {
		const db = await this.getDB();
		const storeNames = [
			"concepts",
			"namespaces",
			"relations",
			"filters",
			"syncState",
		];
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeNames, "readwrite");
			for (const change of changes) {
				const store = tx.objectStore(change.store);
				if (change.operation === "delete") store.delete(change.key);
				else store.put(change.value, change.key);
			}
			if (checkpoint) tx.objectStore("syncState").put(checkpoint);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () =>
				reject(tx.error ?? new Error("IndexedDB projection batch aborted"));
		});
	}
}

export class IndexedDbExpressionStoreBackend implements ExpressionStoreBackend {
	constructor(private dbName: string = "stateful_mcp_dict") {}

	private async getDB(): Promise<IDBDatabase> {
		return openDb(this.dbName, (db) => {
			if (!db.objectStoreNames.contains("expressions")) {
				const store = db.createObjectStore("expressions", { keyPath: "id" });
				store?.createIndex?.("by_lookupTerm", "lookupTerm", { unique: false });
				store?.createIndex?.("by_conceptId", "conceptId", { unique: false });
				store?.createIndex?.("by_active", "active", { unique: false });
			}
		});
	}

	async load(expressions: CustomExpression[]): Promise<void> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("expressions", "readonly");
			const store = tx.objectStore("expressions");
			const request = store.getAll();

			request.onsuccess = () => {
				expressions.push(...request.result);
				resolve();
			};
			request.onerror = () => reject(request.error);
		});
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("expressions", "readwrite");
			const store = tx.objectStore("expressions");

			for (const delta of deltas) {
				if (delta.kind !== "expression") continue;
				if (delta.op === "set" && delta.data) {
					store.put(delta.data);
				} else {
					store.delete(delta.id);
				}
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}
