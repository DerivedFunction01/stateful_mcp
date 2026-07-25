/// <reference lib="dom" />

import type { KvBackend } from "./KvBackend";

export interface IndexedDbKvBackendOptions {
	dbName: string;
	storeName?: string;
}

export class IndexedDbKvBackend implements KvBackend {
	private readonly dbName: string;
	private readonly storeName: string;
	private dbPromise: Promise<IDBDatabase> | null = null;

	constructor(options: IndexedDbKvBackendOptions) {
		this.dbName = options.dbName;
		this.storeName = options.storeName ?? "kv";
	}

	private async getDb(): Promise<IDBDatabase> {
		if (!this.dbPromise) {
			this.dbPromise = new Promise((resolve, reject) => {
				const request = indexedDB.open(this.dbName, 1);
				request.onupgradeneeded = () => {
					const db = request.result;
					if (!db.objectStoreNames.contains(this.storeName)) {
						db.createObjectStore(this.storeName);
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		}
		return this.dbPromise;
	}

	async load(): Promise<Record<string, unknown>> {
		if (typeof indexedDB === "undefined") return {};
		const db = await this.getDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readonly");
			const store = tx.objectStore(this.storeName);
			const request = store.getAllKeys();
			const result: Record<string, unknown> = {};
			request.onsuccess = async () => {
				const keys = request.result as string[];
				for (const key of keys) {
					try {
						result[key] = await new Promise((res, rej) => {
							const r = store.get(key);
							r.onsuccess = () => res(r.result);
							r.onerror = () => rej(r.error);
						});
					} catch {
						// skip unreadable record
					}
				}
				resolve(result);
			};
			request.onerror = () => reject(request.error);
		});
	}

	async set(key: string, value: unknown): Promise<void> {
		if (typeof indexedDB === "undefined") return;
		const db = await this.getDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readwrite");
			const store = tx.objectStore(this.storeName);
			const request = store.put(value, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async delete(key: string): Promise<void> {
		if (typeof indexedDB === "undefined") return;
		const db = await this.getDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readwrite");
			const store = tx.objectStore(this.storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async save(): Promise<void> {}
}
