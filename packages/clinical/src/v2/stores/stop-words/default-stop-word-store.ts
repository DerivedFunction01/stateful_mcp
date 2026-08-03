import type { StopWordContext } from "../interfaces";
import type {
	StopWordProfile,
	StopWordProfileStore,
	StopWordStore,
	StopWordWordListStore,
} from "./interfaces";
import { StopWordCompiler } from "./stop-word-compiler";

export class DefaultStopWordStore implements StopWordStore {
	private readonly compiler: StopWordCompiler;

	constructor(
		private readonly profileStore: StopWordProfileStore,
		readonly wordListStore: StopWordWordListStore,
	) {
		this.compiler = new StopWordCompiler(profileStore, wordListStore);
	}

	async getProfile(personnelId: string): Promise<StopWordProfile | null> {
		return this.profileStore.get(personnelId);
	}

	async setProfile(profile: StopWordProfile): Promise<void> {
		await this.profileStore.set(profile);
	}

	async set(profile: StopWordProfile): Promise<void> {
		await this.setProfile(profile);
	}

	async deleteProfile(personnelId: string): Promise<void> {
		const existing = await this.profileStore.get(personnelId);
		if (!existing) return;
		await this.profileStore.delete(existing.profileId);
	}

	async compileStopWords(personnelId: string): Promise<Set<string>> {
		const profile = await this.profileStore.get(personnelId);
		if (!profile) return new Set();
		return this.compiler.compileForContext({ personnelId });
	}

	async compileStopWordsForContext(
		context: StopWordContext,
	): Promise<Set<string>> {
		return this.compileStopWords(context.personnelId);
	}
}
