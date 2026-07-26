import type { KvBackend } from "@stateful-mcp/core";
import type { ParserSyntaxProfile } from "../interfaces";
import type { ParserProfileCoreStore } from "./interfaces";

export class KvParserProfileStore implements ParserProfileCoreStore {
	private readonly prefix = "profile:";

	constructor(private readonly backend: KvBackend) {}

	async get(profileId: string): Promise<ParserSyntaxProfile | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + profileId];
		return (value as ParserSyntaxProfile | undefined) ?? null;
	}

	async list(): Promise<ParserSyntaxProfile[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ParserSyntaxProfile);
	}

	async set(profile: ParserSyntaxProfile): Promise<void> {
		await this.backend.set(this.prefix + profile.profileId, profile);
		await this.backend.save();
	}

	async delete(profileId: string): Promise<void> {
		await this.backend.delete(this.prefix + profileId);
		await this.backend.save();
	}
}
