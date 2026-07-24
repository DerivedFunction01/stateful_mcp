import type {
	OrderedLearningRecord,
	OrderedLearningRelation,
	OrderedLearningToken,
} from "./ordered-learning-store";

// ── Ranking Signal Types ─────────────────────────────────────────────────────

export interface OrderedLearningRankingSignal {
	adjacentPairScore: number;
	relationScore: number;
	sequenceSignatureScore: number;
}

export interface OrderedLearningRankedCandidate {
	candidate: OrderedLearningRecord;
	signals: OrderedLearningRankingSignal;
	combinedScore: number;
}

// ── Feature Extraction ───────────────────────────────────────────────────────

/**
 * Extracts adjacent token pair signatures from a token sequence.
 * Each pair is a tuple of (kind:key, kind:key) for adjacent tokens.
 */
export function extractAdjacentPairs(
	tokens: OrderedLearningToken[],
): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	for (let i = 0; i < tokens.length - 1; i++) {
		const current = tokens[i]!;
		const next = tokens[i + 1]!;
		const left = `${current.kind}:${current.key}`;
		const right = `${next.kind}:${next.key}`;
		pairs.push([left, right]);
	}
	return pairs;
}

/**
 * Builds a sequence signature string from the token sequence.
 * Uses a sliding window of adjacent pairs to create a hashable signature.
 */
export function buildSequenceSignature(tokens: OrderedLearningToken[]): string {
	const pairs = extractAdjacentPairs(tokens);
	return pairs.map(([a, b]) => `${a}->${b}`).join("|");
}

/**
 * Computes the fraction of candidate adjacent pairs that match
 * the accepted history's adjacent pairs.
 */
export function scoreAdjacentPairs(
	candidatePairs: Array<[string, string]>,
	historyPairs: Array<[string, string]>,
): number {
	if (candidatePairs.length === 0) return 0;
	const historySet = new Set(historyPairs.map(([a, b]) => `${a}|${b}`));
	const matches = candidatePairs.filter(([a, b]) =>
		historySet.has(`${a}|${b}`),
	).length;
	return matches / candidatePairs.length;
}

/**
 * Computes the fraction of candidate relations that match
 * the accepted history's relations.
 */
export function scoreRelations(
	candidateRelations: OrderedLearningRelation[],
	historyRelations: OrderedLearningRelation[],
): number {
	if (candidateRelations.length === 0) return 0;
	const historySet = new Set(
		historyRelations.map((r) => `${r.fromKey}|${r.toKey}|${r.relationType}`),
	);
	const matches = candidateRelations.filter((r) =>
		historySet.has(`${r.fromKey}|${r.toKey}|${r.relationType}`),
	).length;
	return matches / candidateRelations.length;
}

/**
 * Computes the sequence signature similarity between a candidate
 * and the accepted history. Uses exact signature match for v1.
 */
export function scoreSequenceSignature(
	candidateSignature: string,
	historySignatures: string[],
): number {
	if (historySignatures.length === 0) return 0;
	const exactMatches = historySignatures.filter(
		(sig) => sig === candidateSignature,
	).length;
	return exactMatches / historySignatures.length;
}
