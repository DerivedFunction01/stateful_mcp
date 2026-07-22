import type { EntityStore } from "./interfaces";

declare const window: any;

function getBrowserStorage(): Storage | null {
	if (typeof window !== "undefined" && window.localStorage) {
		return window.localStorage;
	}
	return null;
}

export class LocalStorageEntityStore<T> implements EntityStore<T> {
	constructor(private prefix = "stateful_mcp:entity:") {}

	private scoped(id: string): string {
		return `${this.prefix}${id}`;
	}

	async get(id: string): Promise<T | null> {
		const storage = getBrowserStorage();
		if (!storage) return null;
		const data = storage.getItem(this.scoped(id));
		return data ? JSON.parse(data) : null;
	}

	async set(id: string, entity: T): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.setItem(this.scoped(id), JSON.stringify(entity));
	}

	async list(): Promise<T[]> {
		const storage = getBrowserStorage();
		if (!storage) return [];
		const prefix = this.prefix;
		const results: T[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && key.startsWith(prefix)) {
				const data = storage.getItem(key);
				if (data) {
					try {
						results.push(JSON.parse(data));
					} catch {
						// skip non-JSON entries
					}
				}
			}
		}
		return results;
	}

	async delete(id: string): Promise<void> {
		const storage = getBrowserStorage();
		if (!storage) return;
		storage.removeItem(this.scoped(id));
	}
}
