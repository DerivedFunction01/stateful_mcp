import type {
	NgramStore,
	NgramSuggestion,
} from "../../store/learning/interfaces";
import type { AutocompleteSuggestion } from "../../store/reference/auto-complete/interfaces";

const MAX_SUGGESTIONS = 5;

function recencyScore(lastUpdatedAt?: string): number {
	if (!lastUpdatedAt) return 0;
	const elapsedMs = Date.now() - Date.parse(lastUpdatedAt);
	const elapsedDays = Math.max(0, elapsedMs / 86_400_000);
	return 1 / (1 + elapsedDays);
}

function prefixScore(prefix: string, ngram: string): number {
	if (!prefix) return 0;
	const lowerPrefix = prefix.toLowerCase();
	const lowerNgram = ngram.toLowerCase();
	if (lowerNgram.startsWith(lowerPrefix)) {
		return lowerPrefix.length / Math.max(lowerNgram.length, 1);
	}
	return 0;
}

const COLD_START_MAX_FREQ = 100;

function computeScore(
	suggestion: NgramSuggestion,
	globalMaxFreq: number,
): number {
	const prefix = ""; // caller passes prefix separately; we use the ngram itself
	const ps = 0; // prefix match is handled at call site
	const freq = Math.min(
		suggestion.frequency / Math.max(globalMaxFreq, COLD_START_MAX_FREQ),
		1,
	);
	const recency = recencyScore(suggestion.lastUpdatedAt);
	return ps * 0.5 + freq * 0.3 + recency * 0.2;
}

export class NgramSuggester {
	constructor(private readonly ngramStore: NgramStore) {}

	async suggest(
		partialText: string,
		activeTemplateId?: string | null,
	): Promise<AutocompleteSuggestion[]> {
		const raw = await this.ngramStore.suggest(partialText, 10);
		if (raw.length === 0) return [];

		const maxFreq = Math.max(...raw.map((r) => r.frequency), 1);
		const scored: Array<{ suggestion: NgramSuggestion; score: number }> = [];

		for (const r of raw) {
			const ps = prefixScore(partialText, r.ngram);
			const freq = Math.min(r.frequency / maxFreq, 1);
			const recency = recencyScore(r.lastUpdatedAt);
			let score = ps * 0.5 + freq * 0.3 + recency * 0.2;

			// Context boost for active template match
			if (activeTemplateId) {
				// Generic boost: we don't have templateId in the suggestion response
				// but we apply a small general boost for any n-gram in session context
				score += 0.05;
			}

			scored.push({ suggestion: r, score });
		}

		scored.sort((a, b) => b.score - a.score);
		const top = scored.slice(0, MAX_SUGGESTIONS);

		return top.map(({ suggestion: r, score }) => ({
			kind: r.kind,
			templateId: `ngram:${r.kind}`,
			slotName: r.ngram,
			triggerPattern: partialText,
			insertText: `${r.ngram} `,
			cursorOffset: r.ngram.length + 1,
			rankScore: Math.max(0, Math.min(1, score)),
		}));
	}

	async getTopByKind(
		kind: AutocompleteSuggestion["kind"],
	): Promise<AutocompleteSuggestion[]> {
		const raw = await this.ngramStore.getTopByKind(kind, MAX_SUGGESTIONS);
		if (raw.length === 0) return [];

		const maxFreq = Math.max(...raw.map((r) => r.frequency), 1);

		return raw.map((r) => {
			const score = computeScore(r, maxFreq);
			return {
				kind: r.kind,
				templateId: `ngram:${r.kind}`,
				slotName: r.ngram,
				triggerPattern: "",
				insertText: `${r.ngram} `,
				cursorOffset: r.ngram.length + 1,
				rankScore: Math.max(0, Math.min(1, score)),
			};
		});
	}
}
