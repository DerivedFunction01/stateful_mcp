import type { KvBackend } from "@stateful-mcp/core";
import type { TagRecord, TagStore } from "./interfaces";

export class KvTagStore implements TagStore {
	private readonly prefix = "tag:";

	constructor(private readonly backend: KvBackend) {}

	async get(tagId: string): Promise<TagRecord | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + tagId];
		return (value as TagRecord | undefined) ?? null;
	}

	async list(): Promise<TagRecord[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as TagRecord);
	}

	async set(record: TagRecord): Promise<void> {
		await this.backend.set(this.prefix + record.tagId, record);
		await this.backend.save();
	}

	async delete(tagId: string): Promise<void> {
		await this.backend.delete(this.prefix + tagId);
		await this.backend.save();
	}
}
