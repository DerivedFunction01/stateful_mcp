import type { StopWordContext, StopWordStore } from "../store/interfaces";

export class StopWordParser {
	private stopWordsSet: Set<string>;

	constructor(stopWords: string[]) {
		this.stopWordsSet = new Set(stopWords.map((w) => w.toLowerCase().trim()));
	}

	static async fromStore(
		store: StopWordStore,
		context: StopWordContext,
	): Promise<StopWordParser> {
		const words = await store.compileStopWordsForContext(context);
		return new StopWordParser(Array.from(words));
	}

	isStopWord(word: string): boolean {
		return this.stopWordsSet.has(word.toLowerCase().trim());
	}
}
