import type { StopWordContext } from "../interfaces";
import type { StopWordProfile } from "./interfaces";
import type { StopWordWordListStore } from "./word-list-store-interfaces";

export class StopWordCompiler {
	constructor(
		private readonly profileStore: {
			get(personnelId: string): Promise<StopWordProfile | null>;
		},
		private readonly wordListStore: StopWordWordListStore,
	) {}

	async compileForContext(context: StopWordContext): Promise<Set<string>> {
		const profile = await this.profileStore.get(context.personnelId);
		if (!profile) return new Set();

		const compiled = new Set<string>();

		for (const id of profile.wordListIds ?? []) {
			const words = await this.wordListStore.get(id);
			if (words) {
				for (const w of words) {
					compiled.add(w.toLowerCase());
				}
			}
		}

		for (const w of profile.excludedWords ?? []) {
			compiled.delete(w.toLowerCase());
		}

		for (const w of profile.additionalWords ?? []) {
			compiled.add(w.toLowerCase());
		}

		for (const w of profile.customWords ?? []) {
			compiled.add(w.toLowerCase());
		}

		return compiled;
	}
}
