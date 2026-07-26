import type { KvBackend } from "@stateful-mcp/core";
import type { StopWordProfile } from "../../parser/interfaces";
import type { StopWordProfileStore } from "./interfaces";

export class KvStopWordProfileStore implements StopWordProfileStore {
	private readonly prefix = "stopWordProfile:";

	constructor(private readonly backend: KvBackend) {}

	async get(profileId: string): Promise<StopWordProfile | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + profileId];
		return (value as StopWordProfile | undefined) ?? null;
	}

	async list(): Promise<StopWordProfile[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as StopWordProfile);
	}

	async set(profile: StopWordProfile): Promise<void> {
		await this.backend.set(this.prefix + profile.profileId, profile);
		await this.backend.save();
	}

	async delete(profileId: string): Promise<void> {
		await this.backend.delete(this.prefix + profileId);
		await this.backend.save();
	}
}
