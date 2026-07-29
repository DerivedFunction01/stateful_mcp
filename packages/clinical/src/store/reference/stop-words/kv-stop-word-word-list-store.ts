import type { KvBackend } from "@stateful-mcp/core";
import type { StopWordWordListStore } from "./word-list-store-interfaces";

export class KvStopWordWordListStore implements StopWordWordListStore {
	private readonly prefix = "stopWordWordList:";

	constructor(private readonly backend: KvBackend) {}

	async get(id: string): Promise<string[] | null> {
		const data = await this.backend.load();
		const row = data[this.prefix + id];
		if (!row) return null;
		return (row as { words: string[] }).words ?? null;
	}

	async list(): Promise<Array<{ id: string; words: string[] }>> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([k, v]) => ({
				id: k.slice(this.prefix.length),
				words: (v as { words: string[] }).words ?? [],
			}));
	}

	async set(id: string, words: string[]): Promise<void> {
		await this.backend.set(this.prefix + id, { words });
		await this.backend.save();
	}

	async delete(id: string): Promise<void> {
		await this.backend.delete(this.prefix + id);
		await this.backend.save();
	}
}
