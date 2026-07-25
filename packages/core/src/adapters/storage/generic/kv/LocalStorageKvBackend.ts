/// <reference lib="dom" />

import type { KvBackend } from "./KvBackend";

export interface LocalStorageKvBackendOptions {
	prefix: string;
}

export class LocalStorageKvBackend implements KvBackend {
	private readonly prefix: string;

	constructor(options: LocalStorageKvBackendOptions) {
		this.prefix = options.prefix;
	}

	async load(): Promise<Record<string, unknown>> {
		if (typeof window === "undefined") return {};
		const result: Record<string, unknown> = {};
		const prefix = this.prefix;
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key?.startsWith(prefix)) continue;
			try {
				result[key.slice(prefix.length)] = JSON.parse(
					localStorage.getItem(key) ?? "null",
				);
			} catch {
				result[key.slice(prefix.length)] = localStorage.getItem(key);
			}
		}
		return result;
	}

	async set(key: string, value: unknown): Promise<void> {
		if (typeof window === "undefined") return;
		localStorage.setItem(this.prefix + key, JSON.stringify(value));
	}

	async delete(key: string): Promise<void> {
		if (typeof window === "undefined") return;
		localStorage.removeItem(this.prefix + key);
	}

	async save(): Promise<void> {}
}
