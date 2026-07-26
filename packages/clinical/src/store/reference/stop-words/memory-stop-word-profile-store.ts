import type { StopWordProfile } from "../../parser/interfaces";
import type { StopWordProfileStore } from "./interfaces";

export class MemoryStopWordProfileStore implements StopWordProfileStore {
	private readonly profiles = new Map<string, StopWordProfile>();

	async get(profileId: string): Promise<StopWordProfile | null> {
		return this.profiles.get(profileId) ?? null;
	}

	async list(): Promise<StopWordProfile[]> {
		return Array.from(this.profiles.values()).map((p) => ({ ...p }));
	}

	async set(profile: StopWordProfile): Promise<void> {
		this.profiles.set(profile.profileId, { ...profile });
	}

	async delete(profileId: string): Promise<void> {
		this.profiles.delete(profileId);
	}
}
