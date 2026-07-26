import type { ProfileTagStore } from "./interfaces";

export class MemoryProfileTagStore implements ProfileTagStore {
	private readonly tags = new Map<string, Set<string>>();

	async getProfileTags(profileId: string): Promise<string[]> {
		return Array.from(this.tags.get(profileId) ?? []);
	}

	async setProfileTags(profileId: string, tagIds: string[]): Promise<void> {
		this.tags.set(profileId, new Set(tagIds));
	}

	async deleteProfileTags(profileId: string, tagIds?: string[]): Promise<void> {
		const existing = this.tags.get(profileId);
		if (!existing) return;
		if (tagIds && tagIds.length > 0) {
			for (const id of tagIds) existing.delete(id);
		} else {
			this.tags.delete(profileId);
		}
	}
}
