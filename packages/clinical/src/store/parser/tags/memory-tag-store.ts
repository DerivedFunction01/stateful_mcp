import type { TagRecord, TagStore } from "./interfaces";

export class MemoryTagStore implements TagStore {
	private readonly tags = new Map<string, TagRecord>();

	async get(tagId: string): Promise<TagRecord | null> {
		return this.tags.get(tagId) ?? null;
	}

	async list(): Promise<TagRecord[]> {
		return Array.from(this.tags.values()).map((t) => ({ ...t }));
	}

	async set(record: TagRecord): Promise<void> {
		this.tags.set(record.tagId, { ...record });
	}

	async delete(tagId: string): Promise<void> {
		this.tags.delete(tagId);
	}
}
