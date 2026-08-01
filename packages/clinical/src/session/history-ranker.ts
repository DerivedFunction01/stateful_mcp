export interface HistoryRankOptions {
	/**
	 * Relative weight of recency (position in history) vs frequency.
	 * Higher = recency matters more. Default 0.7.
	 */
	recencyWeight?: number;
	/**
	 * Cap on how many candidates to return. Default 10.
	 */
	limit?: number;
	/**
	 * Optional precomputed frequency map (e.g. from notebook state). When
	 * provided it overrides the frequency derived from the history array,
	 * which matters when the history array is deduplicated.
	 */
	frequency?: Record<string, number>;
	/**
	 * Optional transition/ngram score lookup for multi-token commands.
	 * Returns a 0..1 score for a given command candidate.
	 */
	transitionScore?: (command: string) => number;
}

/**
 * Count command frequencies from a most-recent-first history array.
 */
export function countFrequencies(history: string[]): Record<string, number> {
	const freq: Record<string, number> = {};
	for (const line of history) {
		if (!line) continue;
		freq[line] = (freq[line] ?? 0) + 1;
	}
	return freq;
}

/**
 * Rank command-history candidates by a blend of recency and frequency.
 *
 * `history` is expected in most-recent-first order so that index 0 is the
 * most recent command. Recency contributes a linearly decaying score;
 * frequency contributes a proportional score. For multi-token/long commands
 * (containing a space) an optional transitionScore is blended on top so the
 * ranked suggestion reflects the current editing context.
 */
export function rankHistory(
	history: string[],
	options: HistoryRankOptions = {},
): string[] {
	const {
		recencyWeight = 0.7,
		limit = 10,
		transitionScore,
		frequency,
	} = options;
	const freq = frequency ?? countFrequencies(history);
	const maxFreq = Math.max(1, ...Object.values(freq));
	const scored = history
		.map((line, index) => {
			const recency = 1 - index / Math.max(1, history.length);
			const f = freq[line] ?? 0;
			const fScore = f / maxFreq;
			const isLong = line.includes(" ");
			let score = recencyWeight * recency + (1 - recencyWeight) * fScore;
			if (isLong && transitionScore) {
				const ts = transitionScore(line);
				score = score * 0.6 + ts * 0.4;
			}
			return { line, score, index };
		})
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((s) => s.line)
		.slice(0, limit);
	return Array.from(new Set(scored));
}
