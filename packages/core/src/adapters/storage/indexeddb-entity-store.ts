import type { EntityStore } from "./interfaces";

declare const window: any;

export class IndexedDbEntityStore<T> implements EntityStore<T> {
	constructor(
		private dbName = "stateful_mcp_entities",
		private storeName = "entities",
	) {}

	private async getDB(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (typeof window === "undefined" || !window.indexedDB) {
				reject(new Error("IndexedDB is not available in this environment."));
				return;
			}
			const request = window.indexedDB.open(this.dbName, 1);
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

	private async readKey(key: string): Promise<T | null> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readonly");
			const store = tx.objectStore(this.storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	private async writeKey(key: string, value: T): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readwrite");
			const store = tx.objectStore(this.storeName);
			const request = store.put(value, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private async deleteKey(key: string): Promise<void> {
		const db = await this.getDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readwrite");
			const store = tx.objectStore(this.storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	private async listAllEntries(): Promise<T[]> {
		const db = await this.getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.storeName, "readonly");
			const store = tx.objectStore(this.storeName);
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	}

	async get(id: string): Promise<T | null> {
		return this.readKey(id);
	}

	async set(id: string, entity: T): Promise<void> {
		await this.writeKey(id, entity);
	}

	async list(): Promise<T[]> {
		return this.listAllEntries();
	}

	async delete(id: string): Promise<void> {
		await this.deleteKey(id);
	}
}
