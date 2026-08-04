import type { KvBackend } from "@stateful-mcp/core";
import type { UnifiedProfileRecord, UnifiedProfileStore } from "./profile-store";

export class KvProfileStore implements UnifiedProfileStore {
	constructor(private readonly backend: KvBackend, private readonly prefix = "v2:profile:") {}

	async get(profileId: string): Promise<UnifiedProfileRecord | null> {
		const data = await this.backend.load();
		const value = data[`${this.prefix}${profileId}`];
		return value === undefined ? null : parse(value);
	}

	async list(): Promise<UnifiedProfileRecord[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) => parse(value))
			.sort((left, right) => left.profileId.localeCompare(right.profileId));
	}

	async set(profile: UnifiedProfileRecord): Promise<void> {
		await this.backend.set(`${this.prefix}${profile.profileId}`, JSON.stringify(profile));
		await this.backend.save();
	}

	async delete(profileId: string): Promise<void> {
		await this.backend.delete(`${this.prefix}${profileId}`);
		await this.backend.save();
	}
}

function parse(value: unknown): UnifiedProfileRecord {
	return typeof value === "string" ? JSON.parse(value) as UnifiedProfileRecord : value as UnifiedProfileRecord;
}
