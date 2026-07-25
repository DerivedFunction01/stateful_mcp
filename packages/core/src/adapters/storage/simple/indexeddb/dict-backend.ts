declare const window: any;
type IDBOpenDBRequest = any;
type IDBDatabase = any;
type IDBTransaction = any;
type IDBObjectStore = any;
type IDBRequest = any;
type IDBCursor = any;
type IDBFactory = any;
type IDBIndex = any;

import type {
	ConceptRelation,
	CustomExpression,
} from "../../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "../dict-backend";

function getIndexedDB(): IDBFactory | null {
	if (typeof window !== "undefined" && window.indexedDB) {
		return window.indexedDB;
	}
	return null;
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

export class IndexedDbConceptStoreBackend implements ConceptStoreBackend {
	constructor(private dbName: string = "stateful_mcp_dict") {}

	private async getDB(): Promise<IDBDatabase> {
		return openDb(this.dbName, (db) => {
			if (!db.objectStoreNames.contains("concepts")) {
				db.createObjectStore("concepts");
			}
			if (!db.objectStoreNames.contains("namespaces")) {
				db.createObjectStore("namespaces");
			}
			if (!db.objectStoreNames.contains("relations")) {
				const relStore = db.createObjectStore("relations", { keyPath: "id" });
				relStore.createIndex("by_conceptId", "conceptId", { unique: false });
				relStore.createIndex("by_linkedId", "linkedId", { unique: false });
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

	async save(
		concepts: Map<string, any>,
		namespaces: Map<string, any>,
		relations: ConceptRelation[],
	): Promise<void> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(
				["concepts", "namespaces", "relations"],
				"readwrite",
			);

			tx.objectStore("concepts").clear();
			tx.objectStore("namespaces").clear();
			tx.objectStore("relations").clear();

			for (const c of concepts.values()) {
				tx.objectStore("concepts").put(c, c.id);
			}
			for (const ns of namespaces.values()) {
				tx.objectStore("namespaces").put(ns, ns.code);
			}
			for (const r of relations) {
				tx.objectStore("relations").put(r, r.id);
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}

export class IndexedDbExpressionStoreBackend implements ExpressionStoreBackend {
	constructor(private dbName: string = "stateful_mcp_dict") {}

	private async getDB(): Promise<IDBDatabase> {
		return openDb(this.dbName, (db) => {
			if (!db.objectStoreNames.contains("expressions")) {
				db.createObjectStore("expressions", { keyPath: "id" });
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

	async save(expressions: CustomExpression[]): Promise<void> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("expressions", "readwrite");
			const store = tx.objectStore("expressions");

			store.clear();

			for (const e of expressions) {
				store.put(e, e.id);
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}
