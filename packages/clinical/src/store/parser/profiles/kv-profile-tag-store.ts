import type { KvBackend } from "@stateful-mcp/core";
import type { ProfileTagStore } from "./interfaces";

export class KvProfileTagStore implements ProfileTagStore {
	private readonly prefix = "profileTag:";

	constructor(private readonly backend: KvBackend) {}

	async getProfileTags(profileId: string): Promise<string[]> {
		const data = await this.backend.load();
		const value = data[this.prefix + profileId];
		return (value as string[] | undefined) ?? [];
	}

	async setProfileTags(profileId: string, tagIds: string[]): Promise<void> {
		await this.backend.set(this.prefix + profileId, [...tagIds]);
		await this.backend.save();
	}

	async deleteProfileTags(profileId: string, tagIds?: string[]): Promise<void> {
		if (tagIds && tagIds.length > 0) {
			const existing = await this.getProfileTags(profileId);
			const remaining = existing.filter((id) => !tagIds.includes(id));
			if (remaining.length === 0) {
				await this.backend.delete(this.prefix + profileId);
			} else {
				await this.backend.set(this.prefix + profileId, remaining);
			}
		} else {
			await this.backend.delete(this.prefix + profileId);
		}
		await this.backend.save();
	}
}
