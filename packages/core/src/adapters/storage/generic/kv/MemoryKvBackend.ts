import type { KvBackend } from "./KvBackend";

export class MemoryKvBackend implements KvBackend {
	private data = new Map<string, unknown>();

	async load(): Promise<Record<string, unknown>> {
		const result: Record<string, unknown> = {};
		for (const [k, v] of this.data) result[k] = v;
		return result;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.data.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.data.delete(key);
	}

	async save(): Promise<void> {}
}
