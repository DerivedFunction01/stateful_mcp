import type { ParserSyntaxProfile } from "../interfaces";
import type { ParserProfileCoreStore } from "./interfaces";

export class MemoryParserProfileStore implements ParserProfileCoreStore {
	private readonly profiles = new Map<string, ParserSyntaxProfile>();

	async get(profileId: string): Promise<ParserSyntaxProfile | null> {
		return this.profiles.get(profileId) ?? null;
	}

	async list(): Promise<ParserSyntaxProfile[]> {
		return Array.from(this.profiles.values()).map((p) => ({ ...p }));
	}

	async set(profile: ParserSyntaxProfile): Promise<void> {
		this.profiles.set(profile.profileId, { ...profile });
	}

	async delete(profileId: string): Promise<void> {
		this.profiles.delete(profileId);
	}
}
